import { prisma } from "@/lib/prisma";
import { evaluateProposalReadiness, deriveInitialStatus } from "@/lib/proposals/dataEnforcement";
import { distributeFunnelBudget } from "@/lib/ads/funnelBudget";
import type { ProposalPayload } from "@/lib/agent/schema";

export interface ProposeActionContext {
  credentialId: string;
  /** Ausente quando a proposta vem de uma analise autonoma do scheduler, sem chat associado. */
  threadId?: string;
  /** Presente so quando chamado a partir de uma conversa real (chat) - vira createdByUserId,
   * o sinal real de "isto foi criado com um usuario presente" usado pra filtrar notificacoes
   * (so proposta com createdByUserId null - scheduler/agente autonomo - vira notificacao). */
  userId?: string | null;
}

/**
 * Unica tool de "acao" do agente: cria uma Proposal em estado PENDING ou NEEDS_MORE_DATA,
 * nunca executa nada. dataEnforcement decide o status inicial - uma acao sobre campanha/anuncio
 * existente sem id real + metrica financeira real nunca nasce PENDING (fica NEEDS_MORE_DATA).
 */
export async function proposeAction(ctx: ProposeActionContext, payload: ProposalPayload) {
  const readiness = evaluateProposalReadiness({
    type: payload.type,
    platform: payload.platform,
    platformCampaignId: payload.platformCampaignId,
    platformAdId: payload.platformAdId,
    metricsJson: payload.metricsJson,
  });
  const status = deriveInitialStatus(readiness);

  // NEW_FUNNEL cria a Proposal + as 5 ProposalFunnelLayer juntas, numa transacao - o
  // orcamento total ja e dividido aqui (nao no executor, que so LE o que ja foi
  // decidido), pra ficar visivel pra revisao (ex: tela de upload por camada) antes de
  // qualquer coisa tocar a Meta.
  const funnelLayers =
    payload.type === "NEW_FUNNEL" && payload.funnelPlan
      ? distributeFunnelBudget(payload.funnelPlan.totalDailyBudget)
      : null;

  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        credentialId: ctx.credentialId,
        threadId: ctx.threadId ?? null,
        createdByUserId: ctx.userId ?? null,
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

    if (funnelLayers && payload.type === "NEW_FUNNEL" && payload.funnelPlan) {
      const layerByKey = new Map(payload.funnelPlan.layers.map((layer) => [layer.layerKey, layer]));
      await tx.proposalFunnelLayer.createMany({
        data: funnelLayers.map(({ layerKey, dailyBudget }) => {
          const layerPlan = layerByKey.get(layerKey);
          if (!layerPlan) {
            // Nunca deveria acontecer - funnelPlanSchema.refine ja garante as 5 chaves
            // presentes antes disto rodar. Se acontecer mesmo assim, falha alto e
            // claro em vez de gravar uma camada incompleta.
            throw new Error(`funnelPlan sem a camada ${layerKey}`);
          }
          return {
            proposalId: created.id,
            layerKey,
            campaignName: layerPlan.campaignName,
            dailyBudgetMinorUnits: Math.round(dailyBudget * 100),
            headline: layerPlan.headline,
            primaryText: layerPlan.primaryText,
            description: layerPlan.description,
            callToAction: layerPlan.callToAction,
          };
        }),
      });
    }

    return created;
  });

  return {
    proposalId: proposal.id,
    status: proposal.status,
    missing: readiness.missing,
  };
}
