import { prisma } from "@/lib/prisma";
import { ExecutionStatus, type ExecutionAction, type Proposal } from "@/generated/prisma/client";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";
import { toPlatformCredential } from "@/lib/ads/credentials";
import { setMetaAdStatus, setMetaBudget, getMetaBudget, duplicateMetaAdWithBudget } from "@/lib/ads/metaWrite";
import { setGoogleAdStatus, setGoogleCampaignBudget, getGoogleCampaignBudget } from "@/lib/ads/googleWrite";

const AB_TEST_DURATION_DAYS = 7;

interface AbTestSetup {
  controlAdId: string;
  controlAdSetId: string;
  variantAdId: string;
  variantAdSetId: string;
  controlValue: number;
  variantValue: number;
  endsAt: Date;
}

interface DispatchResult {
  ok: boolean;
  requestJson: unknown;
  responseJson?: unknown;
  errorMessage?: string;
  rollbackInfoJson?: unknown;
  abTestSetup?: AbTestSetup;
}

async function findCredential(brandId: string, platform: "META" | "GOOGLE") {
  const record = await prisma.adCredential.findFirst({
    where: { brandId, platform },
    include: { providerConnection: true },
  });
  if (!record) {
    throw new Error(`Nenhuma credencial ${platform} atribuida a esta marca`);
  }
  return toPlatformCredential(record);
}

/** Despacha a chamada real de escrita conforme o tipo da proposta. Nunca chamado sem status aprovado (ver executeProposal). */
async function dispatchExecution(proposal: Proposal): Promise<DispatchResult> {
  if (!proposal.platform) {
    throw new Error("Proposta sem plataforma definida");
  }
  const credential = await findCredential(proposal.brandId, proposal.platform);

  if (proposal.type === "PAUSE_AD" || proposal.type === "ACTIVATE_AD") {
    if (!proposal.platformAdId) {
      throw new Error("Proposta sem platformAdId");
    }
    const wantActive = proposal.type === "ACTIVATE_AD";

    if (proposal.platform === "META") {
      const result = await setMetaAdStatus(credential, proposal.platformAdId, wantActive ? "ACTIVE" : "PAUSED");
      return {
        ok: result.ok,
        requestJson: { adId: proposal.platformAdId, status: wantActive ? "ACTIVE" : "PAUSED" },
        responseJson: result.raw,
        errorMessage: result.errorMessage,
        rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", adId: proposal.platformAdId },
      };
    }

    if (!proposal.platformAdSetId) {
      throw new Error("Proposta sem platformAdSetId (adGroupId necessario para o Google Ads)");
    }
    const result = await setGoogleAdStatus(
      credential,
      proposal.platformAdSetId,
      proposal.platformAdId,
      wantActive ? "ENABLED" : "PAUSED"
    );
    return {
      ok: result.ok,
      requestJson: { adGroupId: proposal.platformAdSetId, adId: proposal.platformAdId, status: wantActive ? "ENABLED" : "PAUSED" },
      responseJson: result.raw,
      errorMessage: result.errorMessage,
      rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", adGroupId: proposal.platformAdSetId, adId: proposal.platformAdId },
    };
  }

  if (proposal.type === "ADJUST_BUDGET") {
    const metrics = (proposal.metricsJson as Record<string, unknown>) ?? {};
    const proposedBudget = Number(metrics.proposedBudget);
    if (!Number.isFinite(proposedBudget) || proposedBudget <= 0) {
      throw new Error("Proposta sem proposedBudget valido em metricsJson");
    }

    if (proposal.platform === "META") {
      if (!proposal.platformAdSetId) {
        throw new Error("Proposta sem platformAdSetId (Meta)");
      }
      const before = await getMetaBudget(credential, proposal.platformAdSetId);
      if (before.errorMessage || !before.level) {
        throw new Error(before.errorMessage ?? "Não foi possível localizar onde a verba mora (AdSet ou campanha/CBO)");
      }
      const dailyBudgetMinorUnits = Math.round(proposedBudget * 100);
      const result = await setMetaBudget(
        credential,
        { level: before.level, adSetId: proposal.platformAdSetId, campaignId: before.campaignId },
        dailyBudgetMinorUnits
      );
      return {
        ok: result.ok,
        requestJson: { level: before.level, adSetId: proposal.platformAdSetId, campaignId: before.campaignId, dailyBudgetMinorUnits },
        responseJson: result.raw,
        errorMessage: result.errorMessage,
        rollbackInfoJson: {
          previousDailyBudget: before.dailyBudgetMinorUnits !== null ? before.dailyBudgetMinorUnits / 100 : null,
          level: before.level,
        },
      };
    }

    if (!proposal.platformCampaignId) {
      throw new Error("Proposta sem platformCampaignId (Google)");
    }
    const before = await getGoogleCampaignBudget(credential, proposal.platformCampaignId);
    if (!before.resourceName) {
      throw new Error("Nao foi possivel localizar o recurso de orcamento da campanha no Google Ads");
    }
    const amountMicros = Math.round(proposedBudget * 1_000_000);
    const result = await setGoogleCampaignBudget(credential, before.resourceName, amountMicros);
    return {
      ok: result.ok,
      requestJson: { budgetResourceName: before.resourceName, amountMicros },
      responseJson: result.raw,
      errorMessage: result.errorMessage,
      rollbackInfoJson: { previousAmountMicros: before.amountMicros },
    };
  }

  if (proposal.type === "CREATE_AB_TEST") {
    if (proposal.platform !== "META") {
      throw new Error("Teste A/B com execução real ainda só é suportado no Meta Ads nesta versão");
    }
    if (!proposal.platformAdId) {
      throw new Error("Proposta sem platformAdId (anúncio original a duplicar)");
    }
    if (!proposal.platformAdSetId) {
      throw new Error("Proposta sem platformAdSetId (AdSet do anúncio original)");
    }

    const metrics = (proposal.metricsJson as Record<string, unknown>) ?? {};
    const currentBudget = Number(metrics.currentBudget);
    const proposedBudget = Number(metrics.proposedBudget);
    if (!Number.isFinite(currentBudget) || !Number.isFinite(proposedBudget) || proposedBudget <= 0) {
      throw new Error("Proposta sem currentBudget/proposedBudget válidos em metricsJson");
    }

    const endsAt = new Date(Date.now() + AB_TEST_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const result = await duplicateMetaAdWithBudget(credential, {
      adId: proposal.platformAdId,
      newDailyBudgetMinorUnits: Math.round(proposedBudget * 100),
      endsAt,
    });

    if (!result.ok || !result.newAdId || !result.newAdSetId) {
      return {
        ok: false,
        requestJson: { adId: proposal.platformAdId, proposedBudget },
        errorMessage: result.errorMessage ?? "Falha ao duplicar anúncio para o teste A/B",
      };
    }

    return {
      ok: true,
      requestJson: { adId: proposal.platformAdId, proposedBudget, endsAt },
      responseJson: result.raw,
      abTestSetup: {
        controlAdId: proposal.platformAdId,
        controlAdSetId: proposal.platformAdSetId,
        variantAdId: result.newAdId,
        variantAdSetId: result.newAdSetId,
        controlValue: currentBudget,
        variantValue: proposedBudget,
        endsAt,
      },
    };
  }

  throw new Error(`Tipo de proposta ${proposal.type} ainda nao suporta execucao automatica`);
}

/**
 * Unico ponto do sistema que pode chamar ads/metaWrite.ts ou ads/googleWrite.ts.
 * So executa se a proposta ja estiver APPROVED (ou TEST) - reconfere isso e a
 * transicao de estado via lib/proposals/lifecycle.ts antes de qualquer chamada real,
 * e sempre grava um ExecutionLog (sucesso ou falha), nunca um caminho de silencio.
 */
export async function executeProposal(proposalId: string, userId: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });

  if (proposal.status !== "APPROVED" && proposal.status !== "TEST") {
    throw new Error(`Proposta precisa estar aprovada antes de executar (está em ${proposal.status})`);
  }

  let dispatch: DispatchResult;
  try {
    dispatch = await dispatchExecution(proposal);
  } catch (error) {
    dispatch = {
      ok: false,
      requestJson: null,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }

  const newStatus: ProposalStatus = dispatch.ok ? "EXECUTED" : "EXECUTION_FAILED";
  assertProposalTransition(proposal.status as ProposalStatus, newStatus);

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: newStatus } });

  const executionLog = await prisma.executionLog.create({
    data: {
      proposalId,
      brandId: proposal.brandId,
      executedByUserId: userId,
      platform: proposal.platform!,
      action: proposal.type as ExecutionAction,
      requestJson: JSON.parse(JSON.stringify(dispatch.requestJson ?? {})),
      responseJson: dispatch.responseJson ? JSON.parse(JSON.stringify(dispatch.responseJson)) : undefined,
      status: dispatch.ok ? ExecutionStatus.SUCCESS : ExecutionStatus.FAILED,
      errorMessage: dispatch.errorMessage,
      rollbackInfoJson: dispatch.rollbackInfoJson ? JSON.parse(JSON.stringify(dispatch.rollbackInfoJson)) : undefined,
    },
  });

  if (dispatch.ok && dispatch.abTestSetup) {
    await prisma.abTest.create({
      data: {
        proposalId,
        brandId: proposal.brandId,
        platform: proposal.platform!,
        controlAdId: dispatch.abTestSetup.controlAdId,
        controlAdSetId: dispatch.abTestSetup.controlAdSetId,
        variantAdId: dispatch.abTestSetup.variantAdId,
        variantAdSetId: dispatch.abTestSetup.variantAdSetId,
        testedVariable: "BUDGET",
        controlValue: dispatch.abTestSetup.controlValue,
        variantValue: dispatch.abTestSetup.variantValue,
        endsAt: dispatch.abTestSetup.endsAt,
        status: "RUNNING",
      },
    });
  }

  return executionLog;
}
