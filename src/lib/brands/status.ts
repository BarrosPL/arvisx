export const BRAND_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  ONBOARDING: "Onboarding",
  PAUSED: "Pausada",
};

export const BRAND_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  ONBOARDING: "secondary",
  PAUSED: "outline",
};

const BRAND_STATUS_TONE: Record<string, "success" | "info" | "neutral"> = {
  ACTIVE: "success",
  ONBOARDING: "info",
  PAUSED: "neutral",
};

/** Tom+rotulo pra <StatusBadge> - reusa os mesmos rotulos de BRAND_STATUS_LABEL. */
export function brandStatusTone(status: string): { tone: "success" | "info" | "neutral"; label: string } {
  return {
    tone: BRAND_STATUS_TONE[status] ?? "neutral",
    label: BRAND_STATUS_LABEL[status] ?? status,
  };
}
