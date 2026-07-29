import type { StatusTone } from "@/components/status-badge";
import type { Verdict } from "./verdict";

export const VERDICT_LABEL: Record<Verdict, string> = {
  BOM: "Bom, com oportunidade de escala",
  MEDIO: "Estável, sem decisão forte",
  RUIM: "Precisa de ação",
};

export const VERDICT_TONE: Record<Verdict, StatusTone> = {
  BOM: "success",
  MEDIO: "neutral",
  RUIM: "danger",
};

export function verdictTone(verdict: Verdict): { tone: StatusTone; label: string } {
  return { tone: VERDICT_TONE[verdict], label: VERDICT_LABEL[verdict] };
}
