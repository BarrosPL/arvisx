import type { StatusTone } from "@/components/status-badge";

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

export const PROPOSAL_STATUS_TONE: Record<string, StatusTone> = {
  NEEDS_MORE_DATA: "warning",
  PENDING: "info",
  APPROVED: "success",
  REJECTED: "neutral",
  TEST: "info",
  ADJUST: "warning",
  EXECUTED: "success",
  EXECUTION_FAILED: "danger",
};

export function proposalStatusTone(status: string): { tone: StatusTone; label: string } {
  return { tone: PROPOSAL_STATUS_TONE[status] ?? "neutral", label: PROPOSAL_STATUS_LABEL[status] ?? status };
}
