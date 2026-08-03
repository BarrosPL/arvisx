import type { StatusTone } from "@/components/status-badge";

// Tudo aqui e interno de proposito: proposalStatusTone e a UNICA porta de saida deste
// arquivo. Expor os mapas soltos foi o que deixou um terceiro (PROPOSAL_STATUS_VARIANT,
// do tempo do Badge antigo do shadcn) sobreviver sem nenhum uso.
const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  NEEDS_MORE_DATA: "Precisa de mais dados",
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
  TEST: "Em teste",
  ADJUST: "Ajustar",
  EXECUTED: "Executada",
  EXECUTION_FAILED: "Falha na execução",
};

const PROPOSAL_STATUS_TONE: Record<string, StatusTone> = {
  NEEDS_MORE_DATA: "warning",
  PENDING: "info",
  APPROVED: "success",
  REJECTED: "neutral",
  TEST: "info",
  ADJUST: "warning",
  EXECUTED: "success",
  EXECUTION_FAILED: "danger",
};

/** Status cru do banco -> cor + rotulo em portugues para o StatusBadge. */
export function proposalStatusTone(status: string): { tone: StatusTone; label: string } {
  return { tone: PROPOSAL_STATUS_TONE[status] ?? "neutral", label: PROPOSAL_STATUS_LABEL[status] ?? status };
}
