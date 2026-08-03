export type ProposalTypeInput =
  | "NEW_CAMPAIGN"
  | "NEW_FUNNEL"
  | "PAUSE_AD"
  | "ACTIVATE_AD"
  | "ADJUST_BUDGET"
  | "CREATE_AD_VARIATION"
  | "CREATE_AB_TEST"
  | "OTHER";

export interface ProposalReadinessInput {
  type: ProposalTypeInput;
  platform: "META" | "GOOGLE" | null;
  platformCampaignId: string | null;
  platformAdId: string | null;
  metricsJson: Record<string, unknown> | null;
}

export interface ProposalReadinessResult {
  ready: boolean;
  missing: string[];
}

const FINANCIAL_METRIC_FIELDS = ["spend", "ctr", "cpc", "cpl", "cpa", "conversions"];

/** Exportado (nao so um literal inline) porque chat-panel.tsx compara contra este texto
 * exato pra decidir se mostra o uploader inline - um so tinha mudado antes (o texto
 * aqui virou "imagem ou vídeo" quando o caminho de video foi adicionado, mas o
 * chat-panel.tsx continuou comparando com a string antiga "imagem do anúncio", que
 * nunca mais dava match - o uploader parou de aparecer pra qualquer proposta). Import
 * direto elimina essa classe de bug de vez. */
export const MISSING_CREATIVE_ASSET_LABEL = "imagem ou vídeo do anúncio";

/** NEW_FUNNEL usa o plural de proposito (5 criativos, um por camada) - texto distinto
 * de MISSING_CREATIVE_ASSET_LABEL pra nunca ser confundido com o caso de proposta
 * unica, mesmo formato/motivo de existir como constante exportada. */
export const MISSING_FUNNEL_CREATIVE_ASSETS_LABEL = "criativos das 5 camadas do funil";

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
 *
 * NEW_CAMPAIGN no Meta sempre nasce NEEDS_MORE_DATA: o criativo/segmentacao ja vem
 * completo no payload (campaignPlan, validado pelo zod antes desta funcao rodar), mas o
 * criativo em si (imagem OU video+capa) ainda nao existe nesse momento - so um humano
 * anexa depois, na revisao da proposta (rota /api/proposals/[id]/creative-asset pra
 * imagem, /creative-video-asset pra video), o que transiciona pra PENDING. NEW_CAMPAIGN
 * no Google (Responsive Search Ad - so texto, sem imagem) ja pode nascer PENDING direto,
 * o campaignPlan.googleAd ja cobre o que falta.
 */
export function evaluateProposalReadiness(input: ProposalReadinessInput): ProposalReadinessResult {
  if (input.type === "NEW_CAMPAIGN") {
    return input.platform === "GOOGLE"
      ? { ready: true, missing: [] }
      : { ready: false, missing: [MISSING_CREATIVE_ASSET_LABEL] };
  }

  // NEW_FUNNEL so existe pra Meta (a esteira depende de Custom Audiences, que so foi
  // implementado pra Meta nesta versao) - sempre nasce NEEDS_MORE_DATA, igual
  // NEW_CAMPAIGN Meta: os 5 criativos sao anexados depois, um por camada, na revisao
  // da proposta (rota /api/proposals/[id]/funnel-layer-asset).
  if (input.type === "NEW_FUNNEL") {
    return { ready: false, missing: [MISSING_FUNNEL_CREATIVE_ASSETS_LABEL] };
  }

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
