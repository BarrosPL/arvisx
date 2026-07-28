import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";

/**
 * Caminho comum das 4 rotas de decisao de proposta (approve/reject/test/adjust): carrega a
 * proposta, exige papel MANAGER na marca dela, valida a transicao de estado
 * (lib/proposals/lifecycle.ts) e so entao grava a decisao com quem decidiu e quando.
 */
export async function decideProposal(proposalId: string, targetStatus: ProposalStatus, note: string | null) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  const { user } = await requireBrandAccess(proposal.brandId, "MANAGER");

  assertProposalTransition(proposal.status as ProposalStatus, targetStatus);

  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: targetStatus,
      decidedByUserId: user.id,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });
}
