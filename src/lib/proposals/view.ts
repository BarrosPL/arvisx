import { type ProposalView, type ProposalAbTestView } from "@/components/proposal-card";
import type { CampaignPlan } from "@/lib/agent/schema";

export interface ProposalRecordForView {
  id: string;
  type: string;
  status: string;
  title: string;
  reason: string;
  metricsJson: unknown;
  suggestedAction: string;
  risk: string;
  rollbackPlan: string;
  platform: string | null;
  platformCampaignId: string | null;
  platformAdId: string | null;
  decisionNote: string | null;
  createdAt: Date;
  payloadJson: unknown;
  creativeAssetData: Buffer | Uint8Array | null;
  executions: { errorMessage: string | null }[];
  abTest: {
    status: string;
    controlValue: unknown;
    variantValue: unknown;
    endsAt: Date;
    winner: string | null;
    resultSummary: unknown;
  } | null;
}

/** Mapeia uma linha do Prisma (Proposal + executions/abTest incluidos) pro formato
 * que ProposalCard espera - reaproveitado pela pagina de propostas por conta e pela
 * pagina com todas as contas (src/app/(app)/proposals/page.tsx), que so difere em nao
 * filtrar por conta e em anexar a conta por item em vez de uma so pro board inteiro. */
export function toProposalView(proposal: ProposalRecordForView): ProposalView {
  const payload = (proposal.payloadJson as { campaignPlan?: CampaignPlan } | null) ?? null;

  return {
    id: proposal.id,
    type: proposal.type,
    status: proposal.status,
    title: proposal.title,
    reason: proposal.reason,
    metricsJson: (proposal.metricsJson as Record<string, unknown>) ?? {},
    suggestedAction: proposal.suggestedAction,
    risk: proposal.risk,
    rollbackPlan: proposal.rollbackPlan,
    platform: proposal.platform,
    platformCampaignId: proposal.platformCampaignId,
    platformAdId: proposal.platformAdId,
    decisionNote: proposal.decisionNote,
    createdAt: proposal.createdAt.toISOString(),
    // Nunca manda os bytes da imagem pro client - so se ja tem uma anexada ou nao.
    hasCreativeAsset: proposal.creativeAssetData !== null,
    campaignPlan: proposal.type === "NEW_CAMPAIGN" ? (payload?.campaignPlan ?? null) : null,
    lastExecutionError: proposal.executions[0]?.errorMessage ?? null,
    abTest: proposal.abTest
      ? {
          status: proposal.abTest.status,
          controlValue: Number(proposal.abTest.controlValue),
          variantValue: Number(proposal.abTest.variantValue),
          endsAt: proposal.abTest.endsAt.toISOString(),
          winner: proposal.abTest.winner,
          resultSummary: (proposal.abTest.resultSummary as ProposalAbTestView["resultSummary"]) ?? null,
        }
      : null,
  };
}
