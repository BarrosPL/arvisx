import { prisma } from "@/lib/prisma";
import { requireBrandAccess, assertBrandRole } from "@/lib/session";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";
import { evaluateProposalReadiness } from "@/lib/proposals/dataEnforcement";

/**
 * Nucleo da decisao de uma proposta (approve/reject/test/adjust-so-nota): carrega a
 * proposta, exige papel MANAGER na marca dela (via userId explicito, nao sessao HTTP -
 * reutilizavel tanto pelas rotas REST quanto pela tool de chat decide_proposal), valida
 * a transicao de estado (lib/proposals/lifecycle.ts) e so entao grava a decisao com quem
 * decidiu e quando.
 */
export async function decideProposalAsUser(
  userId: string,
  proposalId: string,
  targetStatus: ProposalStatus,
  note: string | null
) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  await assertBrandRole(userId, proposal.brandId, "MANAGER");

  assertProposalTransition(proposal.status as ProposalStatus, targetStatus);

  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: targetStatus,
      decidedByUserId: userId,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });
}

/** Caminho usado pelas rotas REST (approve/reject/test/adjust) - resolve o usuario da sessao HTTP. */
export async function decideProposal(proposalId: string, targetStatus: ProposalStatus, note: string | null) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  const { user } = await requireBrandAccess(proposal.brandId, "MANAGER");
  return decideProposalAsUser(user.id, proposalId, targetStatus, note);
}

export interface AdjustProposalFields {
  title?: string;
  suggestedAction?: string;
  proposedBudget?: number;
  /** Corrige/completa o id real que faltava - normalmente so usado pra tirar uma
   * proposta de NEEDS_MORE_DATA (ver abaixo). */
  platformCampaignId?: string;
  platformAdId?: string;
  platformAdSetId?: string;
  /** Metricas reais adicionais (spend/ctr/cpc/cpl/cpa/conversions) - mescladas com o
   * metricsJson ja existente, mesmo uso do platformCampaignId acima. */
  metricsJson?: Record<string, number>;
}

/**
 * Versao "conversacional" do ajuste: hoje a UI fazia isso em duas etapas manuais
 * (decideProposal("adjust", nota) trava em ADJUST -> depois um PATCH separado edita os
 * campos e reabre pra PENDING). Na JAMILE conduzindo pelo chat, ela ja tem o valor novo
 * na mesma mensagem - nao faz sentido forcar um estado intermediario so pra sustentar
 * uma UI que nao existe mais aqui.
 *
 * Tambem e o UNICO jeito de tirar uma proposta PAUSE_AD/ACTIVATE_AD/ADJUST_BUDGET/
 * CREATE_AD_VARIATION/CREATE_AB_TEST de NEEDS_MORE_DATA (achado real: nenhuma outra
 * tool de chat conseguia fazer essa transicao especifica - resolve_proposal exige
 * PENDING, e o "ADJUST" so e alcancavel a partir de PENDING tambem, entao uma
 * proposta que nascia em NEEDS_MORE_DATA ficava definitivamente presa, sem chamada
 * nenhuma capaz de avanca-la). NEW_CAMPAIGN (Meta) ja tinha seu proprio escape hatch
 * (rota de upload de imagem, /api/proposals/[id]/creative-asset) - isto e o
 * equivalente pros outros 5 tipos, quando o que falta e id real ou metrica, nao imagem.
 */
export async function adjustProposalAsUser(
  userId: string,
  proposalId: string,
  fields: AdjustProposalFields,
  note: string
) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  await assertBrandRole(userId, proposal.brandId, "MANAGER");

  const currentMetrics = (proposal.metricsJson as Record<string, unknown>) ?? {};
  const metricsJson = {
    ...currentMetrics,
    ...(fields.metricsJson ?? {}),
    ...(fields.proposedBudget !== undefined ? { proposedBudget: fields.proposedBudget } : {}),
  };
  const platformCampaignId = fields.platformCampaignId ?? proposal.platformCampaignId;
  const platformAdId = fields.platformAdId ?? proposal.platformAdId;
  const platformAdSetId = fields.platformAdSetId ?? proposal.platformAdSetId;

  if (proposal.status === "NEEDS_MORE_DATA") {
    // Reavalia com os dados corrigidos - so libera pra PENDING se agora tiver id
    // real + metrica financeira real, a mesma regra de sempre (dataEnforcement.ts),
    // nunca contorna a exigencia so porque o pedido veio por adjust_proposal.
    const readiness = evaluateProposalReadiness({
      type: proposal.type,
      platform: proposal.platform,
      platformCampaignId,
      platformAdId,
      metricsJson,
    });
    if (!readiness.ready) {
      throw new Error(`Ainda falta dado real pra esta proposta: ${readiness.missing.join(", ")}`);
    }
    assertProposalTransition("NEEDS_MORE_DATA", "PENDING");
  } else {
    assertProposalTransition(proposal.status as ProposalStatus, "ADJUST");
    assertProposalTransition("ADJUST", "PENDING");
  }

  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      title: fields.title ?? proposal.title,
      suggestedAction: fields.suggestedAction ?? proposal.suggestedAction,
      platformCampaignId,
      platformAdId,
      platformAdSetId,
      metricsJson: JSON.parse(JSON.stringify(metricsJson)),
      status: "PENDING",
      decidedByUserId: userId,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });
}
