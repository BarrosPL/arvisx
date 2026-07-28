import { prisma } from "@/lib/prisma";
import { ProposalType, type Brand, type ProposalStatus } from "@/generated/prisma/client";
import { collectForBrand } from "@/lib/ads/collect";
import { collectAdLibraryForBrand } from "@/lib/ads/collectLibrary";
import { fetchMetaInsights } from "@/lib/ads/meta";
import { fetchGoogleAdsInsights } from "@/lib/ads/google";
import { fetchMetaAdLibrary } from "@/lib/ads/metaLibrary";
import { fetchGoogleAdLibrary } from "@/lib/ads/googleLibrary";
import { computeAndSaveRanking } from "@/lib/ranking/compute";
import type { RecommendedAction } from "@/lib/ranking/verdict";
import { evaluateProposalReadiness, deriveInitialStatus } from "@/lib/proposals/dataEnforcement";
import { runAutonomousBudgetProposal } from "@/lib/agent/autonomous";

const OPEN_PROPOSAL_STATUSES: ProposalStatus[] = ["PENDING", "NEEDS_MORE_DATA", "TEST", "ADJUST"];

type BrandOutcome = "proposal_created" | "no_action" | "skipped_recent" | "error";

let isRunning = false;

function rowKey(row: RecommendedAction["row"]): string | null {
  return row.platformAdId ?? row.platformCampaignId ?? null;
}

/** Ja existe uma proposta aberta pro mesmo problema (mesma marca/tipo/campanha ou anuncio)? */
async function hasOpenDuplicate(brandId: string, type: ProposalType, key: string): Promise<boolean> {
  const existing = await prisma.proposal.findFirst({
    where: {
      brandId,
      type,
      status: { in: OPEN_PROPOSAL_STATUSES },
      OR: [{ platformAdId: key }, { platformCampaignId: key }],
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Cria uma Proposal direto a partir de uma recomendacao deterministica do ranking - sem
 * chamar a OpenAI. E o mesmo caminho de dados (dataEnforcement) que a tool propose_action
 * do chat usa, so que disparado pela rodada automatica em vez de um pedido do usuario.
 * O dedup (hasOpenDuplicate) ja foi checado por quem chama, antes de decidir qual
 * caminho (deterministico ou agente autonomo) seguir.
 */
async function createProposalFromAction(brandId: string, action: RecommendedAction): Promise<string> {
  const metricsJson: Record<string, number> = {
    spend: action.row.spend,
    ctr: action.row.ctr,
    cpc: action.row.cpc,
    conversions: action.row.conversions,
    ...(action.row.cpl !== null ? { cpl: action.row.cpl } : {}),
    ...(action.row.cpa !== null ? { cpa: action.row.cpa } : {}),
  };

  const readiness = evaluateProposalReadiness({
    type: action.proposalType,
    platformCampaignId: action.row.platformCampaignId,
    platformAdId: action.row.platformAdId,
    metricsJson,
  });
  const status = deriveInitialStatus(readiness);
  const label = action.row.adName ?? action.row.campaignName ?? "anúncio sem nome";

  const proposal = await prisma.proposal.create({
    data: {
      brandId,
      threadId: null,
      createdByUserId: null,
      type: action.proposalType as ProposalType,
      status,
      title: `${label} — ${action.reason}`,
      reason: `Análise automática da JAMILE: ${action.reason}. Risco de não agir: ${action.risk}.`,
      metricsJson,
      suggestedAction: action.suggestedAction,
      risk: action.risk,
      rollbackPlan: action.rollback,
      platform: action.row.platform,
      platformCampaignId: action.row.platformCampaignId,
      platformAdId: action.row.platformAdId,
      platformAdSetId: action.row.platformAdSetId,
      payloadJson: JSON.parse(JSON.stringify({ ...action, source: "proactive_round" })),
    },
  });

  return proposal.id;
}

/**
 * Decide, pra uma recomendacao, se ja existe proposta aberta (pula), se deve virar
 * uma proposta deterministica (Pausar/Ativar - decisao binaria, sem julgamento de
 * valor) ou se deve passar pela JAMILE de verdade (Ajustar verba - precisa decidir
 * um numero com contexto, conforme pedido pelo Renan).
 */
async function handleRecommendedAction(
  brand: Pick<Brand, "id" | "name" | "topicKeywords" | "excludedKeywords">,
  action: RecommendedAction
): Promise<{ outcome: "proposal_created" | "skipped"; proposalId: string | null }> {
  const key = rowKey(action.row);
  if (key && (await hasOpenDuplicate(brand.id, action.proposalType as ProposalType, key))) {
    return { outcome: "skipped", proposalId: null };
  }

  if (action.proposalType === "ADJUST_BUDGET") {
    const { proposalCreated, proposalId } = await runAutonomousBudgetProposal(brand, action);
    return { outcome: proposalCreated ? "proposal_created" : "skipped", proposalId };
  }

  const proposalId = await createProposalFromAction(brand.id, action);
  return { outcome: "proposal_created", proposalId };
}

async function runBrandRound(
  brand: Pick<Brand, "id" | "name" | "topicKeywords" | "excludedKeywords">
): Promise<{ outcome: BrandOutcome; proposalId: string | null; errorMessage: string | null }> {
  try {
    await collectForBrand(brand.id, "META", fetchMetaInsights);
    await collectForBrand(brand.id, "GOOGLE", fetchGoogleAdsInsights);

    // Biblioteca de anuncios e um complemento, nao pode derrubar a rodada (propostas)
    // se a API de listagem falhar por algum motivo - por isso best-effort a parte.
    try {
      await collectAdLibraryForBrand(brand.id, "META", fetchMetaAdLibrary);
      await collectAdLibraryForBrand(brand.id, "GOOGLE", fetchGoogleAdLibrary);
    } catch {
      // best-effort - ver comentario acima
    }

    const snapshot = await computeAndSaveRanking(brand.id);
    const actions = (snapshot.recommendedActionsJson as unknown as RecommendedAction[]) ?? [];

    let lastCreatedId: string | null = null;
    let createdCount = 0;
    let skippedCount = 0;

    for (const action of actions) {
      const result = await handleRecommendedAction(brand, action);
      if (result.outcome === "proposal_created") {
        createdCount += 1;
        lastCreatedId = result.proposalId;
      } else {
        skippedCount += 1;
      }
    }

    const outcome: BrandOutcome = createdCount > 0 ? "proposal_created" : skippedCount > 0 ? "skipped_recent" : "no_action";
    return { outcome, proposalId: lastCreatedId, errorMessage: null };
  } catch (error) {
    return {
      outcome: "error",
      proposalId: null,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Rodada proativa: para cada marca (ordem priorityOrder, igual ao n8n), recoleta dados
 * reais, recalcula o ranking e cria propostas para as recomendacoes ainda nao propostas.
 * Nunca chama ads/metaWrite.ts ou googleWrite.ts - so analisa e propoe.
 */
export async function runProactiveRound(): Promise<{ runId: string }> {
  if (isRunning) {
    throw new Error("Rodada proativa já em andamento");
  }
  isRunning = true;

  const run = await prisma.schedulerRun.create({ data: { status: "running" } });

  try {
    const brands = await prisma.brand.findMany({ orderBy: { priorityOrder: "asc" } });

    for (const brand of brands) {
      const { outcome, proposalId, errorMessage } = await runBrandRound(brand);
      await prisma.schedulerBrandResult.create({
        data: { schedulerRunId: run.id, brandId: brand.id, outcome, proposalId, errorMessage },
      });
    }

    await prisma.schedulerRun.update({
      where: { id: run.id },
      data: { status: "completed", finishedAt: new Date() },
    });
  } catch (error) {
    await prisma.schedulerRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
      },
    });
    throw error;
  } finally {
    isRunning = false;
  }

  return { runId: run.id };
}
