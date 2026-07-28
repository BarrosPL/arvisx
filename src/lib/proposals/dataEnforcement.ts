export type ProposalTypeInput =
  | "NEW_CAMPAIGN"
  | "PAUSE_AD"
  | "ACTIVATE_AD"
  | "ADJUST_BUDGET"
  | "CREATE_AD_VARIATION"
  | "CREATE_AB_TEST"
  | "OTHER";

export interface ProposalReadinessInput {
  type: ProposalTypeInput;
  platformCampaignId: string | null;
  platformAdId: string | null;
  metricsJson: Record<string, unknown> | null;
}

export interface ProposalReadinessResult {
  ready: boolean;
  missing: string[];
}

const FINANCIAL_METRIC_FIELDS = ["spend", "ctr", "cpc", "cpl", "cpa", "conversions"];

/** Tipos que agem sobre uma campanha/anuncio que ja existe na plataforma. */
const EXISTING_CAMPAIGN_ACTIONS = new Set<ProposalTypeInput>([
  "PAUSE_AD",
  "ACTIVATE_AD",
  "ADJUST_BUDGET",
  "CREATE_AD_VARIATION",
  "CREATE_AB_TEST",
]);

function hasRealId(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasFinancialMetric(metrics: Record<string, unknown> | null): boolean {
  if (!metrics) return false;
  return FINANCIAL_METRIC_FIELDS.some(
    (field) => typeof metrics[field] === "number" && Number.isFinite(metrics[field] as number)
  );
}

/**
 * Porta o "Validador Data Enforcement" do n8n: uma proposta de campanha NOVA pode ser
 * hipotese (sem IDs ainda). Uma proposta que age sobre campanha EXISTENTE so esta pronta
 * pra aprovacao se citar um campaign_id/ad_id real e uma metrica financeira real - caso
 * contrario fica marcada como faltando dado, em vez de pedir aprovacao no escuro.
 */
export function evaluateProposalReadiness(input: ProposalReadinessInput): ProposalReadinessResult {
  if (!EXISTING_CAMPAIGN_ACTIONS.has(input.type)) {
    return { ready: true, missing: [] };
  }

  const missing: string[] = [];
  if (!hasRealId(input.platformCampaignId) && !hasRealId(input.platformAdId)) {
    missing.push("campaign_id ou ad_id");
  }
  if (!hasFinancialMetric(input.metricsJson)) {
    missing.push("métrica financeira (spend/ctr/cpc/cpl/cpa/conversions)");
  }

  return { ready: missing.length === 0, missing };
}

/** Status inicial a persistir para uma proposta recem-criada, dado o resultado do enforcement. */
export function deriveInitialStatus(readiness: ProposalReadinessResult): "PENDING" | "NEEDS_MORE_DATA" {
  return readiness.ready ? "PENDING" : "NEEDS_MORE_DATA";
}
