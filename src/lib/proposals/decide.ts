import { prisma } from "@/lib/prisma";
import { requireBrandAccess, assertBrandRole } from "@/lib/session";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";

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
}

/**
 * Versao "conversacional" do ajuste: hoje a UI fazia isso em duas etapas manuais
 * (decideProposal("adjust", nota) trava em ADJUST -> depois um PATCH separado edita os
 * campos e reabre pra PENDING). Na JAMILE conduzindo pelo chat, ela ja tem o valor novo
 * na mesma mensagem - nao faz sentido forcar um estado intermediario so pra sustentar
 * uma UI que nao existe mais aqui. Valida as duas transicoes da mesma forma
 * (PENDING -> ADJUST -> PENDING, ambas precisam ser legais em lifecycle.ts) mas grava
 * direto o resultado final - a proposta nunca fica visivelmente presa em ADJUST.
 */
export async function adjustProposalAsUser(
  userId: string,
  proposalId: string,
  fields: AdjustProposalFields,
  note: string
) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  await assertBrandRole(userId, proposal.brandId, "MANAGER");

  assertProposalTransition(proposal.status as ProposalStatus, "ADJUST");
  assertProposalTransition("ADJUST", "PENDING");

  const currentMetrics = (proposal.metricsJson as Record<string, unknown>) ?? {};
  const metricsJson =
    fields.proposedBudget !== undefined ? { ...currentMetrics, proposedBudget: fields.proposedBudget } : currentMetrics;

  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      title: fields.title ?? proposal.title,
      suggestedAction: fields.suggestedAction ?? proposal.suggestedAction,
      metricsJson: JSON.parse(JSON.stringify(metricsJson)),
      status: "PENDING",
      decidedByUserId: userId,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });
}
