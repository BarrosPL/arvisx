export type ProposalStatus =
  | "NEEDS_MORE_DATA"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "TEST"
  | "ADJUST"
  | "EXECUTED"
  | "EXECUTION_FAILED";

/**
 * Transicoes permitidas por status. Qualquer transicao fora deste mapa e recusada -
 * por exemplo, nunca se pode ir direto de NEEDS_MORE_DATA para EXECUTED, nem reabrir
 * uma proposta REJECTED/EXECUTED.
 */
const ALLOWED_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  NEEDS_MORE_DATA: ["PENDING"],
  PENDING: ["APPROVED", "REJECTED", "TEST", "ADJUST"],
  ADJUST: ["PENDING"],
  APPROVED: ["EXECUTED", "EXECUTION_FAILED"],
  TEST: ["EXECUTED", "EXECUTION_FAILED"],
  EXECUTION_FAILED: ["APPROVED"],
  REJECTED: [],
  EXECUTED: [],
};

export class InvalidProposalTransitionError extends Error {
  constructor(from: ProposalStatus, to: ProposalStatus) {
    super(`Transição de proposta inválida: ${from} → ${to}`);
    this.name = "InvalidProposalTransitionError";
  }
}

export function canTransitionProposal(from: ProposalStatus, to: ProposalStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Lança InvalidProposalTransitionError se a transição não for permitida. Use antes de todo update de status. */
export function assertProposalTransition(from: ProposalStatus, to: ProposalStatus): void {
  if (!canTransitionProposal(from, to)) {
    throw new InvalidProposalTransitionError(from, to);
  }
}
