import { prisma } from "@/lib/prisma";

/**
 * Le uma proposta especifica pelo id - usado pela tool de chat get_proposal, quando o
 * usuario chega vindo de uma notificacao ou referencia uma proposta especifica na
 * conversa. Confere que a proposta realmente pertence a credentialId informado (nao confia
 * so no acesso a marca - a proposta podia ser de outra) antes de devolver qualquer dado.
 */
export async function getProposal(credentialId: string, proposalId: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  if (proposal.credentialId !== credentialId) {
    throw new Error("Essa proposta não pertence à marca informada.");
  }

  const payload = proposal.payloadJson as { campaignPlan?: unknown; funnelPlan?: unknown } | null;

  const funnelLayersStatus =
    proposal.type === "NEW_FUNNEL"
      ? (
          await prisma.proposalFunnelLayer.findMany({
            where: { proposalId },
            select: { layerKey: true, creativeAssetData: true, creativeVideoData: true, creativeCoverImageData: true },
          })
        ).map((layer) => ({
          layerKey: layer.layerKey,
          hasCreativeAsset: layer.creativeAssetData !== null || (layer.creativeVideoData !== null && layer.creativeCoverImageData !== null),
        }))
      : undefined;

  return {
    id: proposal.id,
    type: proposal.type,
    status: proposal.status,
    title: proposal.title,
    reason: proposal.reason,
    suggestedAction: proposal.suggestedAction,
    risk: proposal.risk,
    rollbackPlan: proposal.rollbackPlan,
    platform: proposal.platform,
    platformCampaignId: proposal.platformCampaignId,
    platformAdId: proposal.platformAdId,
    metricsJson: proposal.metricsJson,
    campaignPlan: proposal.type === "NEW_CAMPAIGN" ? (payload?.campaignPlan ?? null) : undefined,
    funnelPlan: proposal.type === "NEW_FUNNEL" ? (payload?.funnelPlan ?? null) : undefined,
    // Duas fontes possiveis de criativo - imagem OU video+capa, nunca as duas na mesma
    // proposta (ver schema.prisma). Contam como "ja tem criativo" as duas.
    hasCreativeAsset:
      proposal.type === "NEW_CAMPAIGN"
        ? proposal.creativeAssetData !== null || (proposal.creativeVideoData !== null && proposal.creativeCoverImageData !== null)
        : undefined,
    // So preenchido pra NEW_FUNNEL - status por camada, pra UI mostrar quantas ja tem
    // criativo sem precisar de outra chamada.
    funnelLayersStatus,
    decisionNote: proposal.decisionNote,
    createdAt: proposal.createdAt,
  };
}
