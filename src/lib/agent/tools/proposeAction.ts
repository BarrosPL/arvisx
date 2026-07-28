import { prisma } from "@/lib/prisma";
import { evaluateProposalReadiness, deriveInitialStatus } from "@/lib/proposals/dataEnforcement";
import type { ProposalPayload } from "@/lib/agent/schema";

export interface ProposeActionContext {
  brandId: string;
  /** Ausente quando a proposta vem de uma analise autonoma do scheduler, sem chat associado. */
  threadId?: string;
}

/**
 * Unica tool de "acao" do agente: cria uma Proposal em estado PENDING ou NEEDS_MORE_DATA,
 * nunca executa nada. dataEnforcement decide o status inicial - uma acao sobre campanha/anuncio
 * existente sem id real + metrica financeira real nunca nasce PENDING (fica NEEDS_MORE_DATA).
 */
export async function proposeAction(ctx: ProposeActionContext, payload: ProposalPayload) {
  const readiness = evaluateProposalReadiness({
    type: payload.type,
    platformCampaignId: payload.platformCampaignId,
    platformAdId: payload.platformAdId,
    metricsJson: payload.metricsJson,
  });
  const status = deriveInitialStatus(readiness);

  const proposal = await prisma.proposal.create({
    data: {
      brandId: ctx.brandId,
      threadId: ctx.threadId ?? null,
      createdByUserId: null,
      type: payload.type,
      status,
      title: payload.title,
      reason: payload.reason,
      metricsJson: payload.metricsJson,
      suggestedAction: payload.suggestedAction,
      risk: payload.risk,
      rollbackPlan: payload.rollbackPlan,
      platform: payload.platform,
      platformCampaignId: payload.platformCampaignId,
      platformAdId: payload.platformAdId,
      platformAdSetId: payload.platformAdSetId,
      payloadJson: payload,
    },
  });

  return {
    proposalId: proposal.id,
    status: proposal.status,
    missing: readiness.missing,
  };
}
