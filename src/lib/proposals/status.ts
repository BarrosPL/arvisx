export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  NEEDS_MORE_DATA: "Precisa de mais dados",
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
  TEST: "Em teste",
  ADJUST: "Ajustar",
  EXECUTED: "Executada",
  EXECUTION_FAILED: "Falha na execução",
};

export const PROPOSAL_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  NEEDS_MORE_DATA: "secondary",
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  TEST: "outline",
  ADJUST: "outline",
  EXECUTED: "default",
  EXECUTION_FAILED: "destructive",
};
