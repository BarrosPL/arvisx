import { assertBrandRole } from "@/lib/session";
import { proposeAction } from "@/lib/agent/tools/proposeAction";
import { decideProposalAsUser } from "@/lib/proposals/decide";
import { executeProposal } from "@/lib/execution/executor";
import type { ProposalPayload } from "@/lib/agent/schema";

export type ChatDecision = "approve" | "reject" | "test";

const DECISION_STATUS = { approve: "APPROVED", reject: "REJECTED", test: "TEST" } as const;

/**
 * Colapsa em UMA chamada o ciclo inteiro (criar -> aprovar -> executar) pra uma acao
 * nova que o usuario acabou de confirmar no chat - substitui a antiga cadeia
 * propose_action -> decide_proposal -> execute_proposal como 3 chamadas separadas, que
 * dependia do modelo lembrar de continuar num turno seguinte (causa raiz real da falha
 * relatada: ela parava depois de criar a proposta e nao completava o resto sozinha).
 * Se faltar dado real (NEEDS_MORE_DATA) ou imagem (NEW_CAMPAIGN/Meta), nao tenta
 * executar - devolve o motivo pra JAMILE resolver e chamar resolveProposal depois.
 */
export async function confirmAndExecuteAction(
  userId: string,
  ctx: { brandId: string; threadId?: string },
  payload: ProposalPayload
) {
  await assertBrandRole(userId, ctx.brandId, "MANAGER");

  const created = await proposeAction({ brandId: ctx.brandId, threadId: ctx.threadId, userId }, payload);

  if (created.status !== "PENDING") {
    return {
      proposalId: created.proposalId,
      executed: false,
      status: created.status,
      missing: created.missing,
    };
  }

  await decideProposalAsUser(userId, created.proposalId, "APPROVED", null);
  const executionLog = await executeProposal(created.proposalId, userId);

  return {
    proposalId: created.proposalId,
    executed: true,
    executionStatus: executionLog.status,
    errorMessage: executionLog.errorMessage,
  };
}

/**
 * Substitui decide_proposal + execute_proposal (2 chamadas separadas) por uma so, pro
 * caso de uma proposta que ja existe (veio de uma notificacao de rodada pro-ativa, ou de
 * um confirmAndExecuteAction anterior que ficou parado em NEEDS_MORE_DATA/sem imagem e
 * agora esta pronta). approve/test decidem E executam; reject so decide, nao ha o que
 * executar.
 */
export async function resolveProposal(userId: string, proposalId: string, decision: ChatDecision, note: string | null) {
  const targetStatus = DECISION_STATUS[decision];
  await decideProposalAsUser(userId, proposalId, targetStatus, note);

  if (decision === "reject") {
    return { proposalId, executed: false, status: targetStatus };
  }

  const executionLog = await executeProposal(proposalId, userId);
  return {
    proposalId,
    executed: true,
    executionStatus: executionLog.status,
    errorMessage: executionLog.errorMessage,
  };
}
