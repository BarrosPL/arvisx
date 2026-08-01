import { prisma } from "@/lib/prisma";
import { requireAccountAccess, assertAccountAccess } from "@/lib/session";

/**
 * Apaga uma proposta de verdade do banco (nao so esconde da tela) - pedido explicito
 * do Renan: propostas removidas da tela precisam sumir do backend tambem, pra nao
 * gerar inconsistencia. So bloqueia se a proposta ja foi executada (sucesso OU
 * falha) - ExecutionLog.proposalId e uma FK obrigatoria, apagar deletaria o
 * historico de uma acao real feita na plataforma. Nao ha "soft delete"/lixeira -
 * decisao consciente de manter simples, dado que o pedido foi so pra tirar
 * propostas que nunca chegaram a virar acao real.
 */
export async function deleteProposalAsUser(userId: string, proposalId: string): Promise<void> {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  await assertAccountAccess(userId, proposal.credentialId);

  const executionCount = await prisma.executionLog.count({ where: { proposalId } });
  if (executionCount > 0) {
    throw new Error(
      "Não é possível excluir uma proposta que já foi executada (sucesso ou falha) - isso apagaria o histórico de uma ação real feita na plataforma."
    );
  }

  await prisma.proposal.delete({ where: { id: proposalId } });
}

/** Caminho usado pela rota REST (botão na tela) - resolve o usuario da sessao HTTP. */
export async function deleteProposal(proposalId: string): Promise<void> {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  const { user } = await requireAccountAccess(proposal.credentialId);
  return deleteProposalAsUser(user.id, proposalId);
}
