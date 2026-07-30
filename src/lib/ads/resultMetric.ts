/**
 * Traduz o OBJETIVO de uma campanha Meta para o tipo de acao que conta como
 * "Resultado" - a mesma logica que o Gerenciador de Anuncios usa na coluna
 * "Resultados".
 *
 * Por que isso existe: a contagem antiga (CONVERSION_ACTION_TYPES em meta.ts) somava
 * uma lista fixa de 8 tipos de conversao pra qualquer campanha. Isso dava dois erros
 * que fariam o numero da tela nunca bater com o Gerenciador:
 * 1. Campanha que nao otimiza conversao (trafego, engajamento, video, alcance)
 *    aparecia com 0 resultado, mesmo entregando resultado de verdade.
 * 2. Campanha de lead com pixel contava EM DOBRO - "lead" e
 *    "offsite_conversion.fb_pixel_lead" reportam o mesmo evento e os dois estavam na
 *    lista sendo somados.
 * A correcao e escolher UM tipo de acao por campanha, com base no objetivo dela.
 */

/** Ordem importa: o primeiro tipo encontrado nas actions e o que conta. Isso resolve a
 * contagem dobrada - "lead" e o pixel equivalente reportam o mesmo evento, entao so um
 * deles pode contar, nunca a soma dos dois. */
const OBJECTIVE_ACTION_PRIORITY: Record<string, string[]> = {
  // Objetivos novos (Outcome-Driven Ad Experiences - o padrao atual da Meta)
  OUTCOME_LEADS: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  OUTCOME_SALES: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"],
  OUTCOME_TRAFFIC: ["link_click", "landing_page_view"],
  OUTCOME_ENGAGEMENT: [
    "onsite_conversion.messaging_conversation_started_7d",
    "post_engagement",
    "page_engagement",
    "video_view",
  ],
  OUTCOME_AWARENESS: ["reach", "impressions"],
  OUTCOME_APP_PROMOTION: ["app_install", "mobile_app_install", "omni_app_install"],

  // Objetivos legados (campanhas antigas continuam reportando esses)
  LEAD_GENERATION: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  CONVERSIONS: [
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
    "offsite_conversion.fb_pixel_complete_registration",
    "purchase",
    "lead",
  ],
  MESSAGES: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"],
  LINK_CLICKS: ["link_click", "landing_page_view"],
  POST_ENGAGEMENT: ["post_engagement", "page_engagement"],
  PAGE_LIKES: ["like", "page_engagement"],
  VIDEO_VIEWS: ["video_view"],
  REACH: ["reach"],
  BRAND_AWARENESS: ["reach", "impressions"],
  APP_INSTALLS: ["mobile_app_install", "app_install"],
  CATALOG_SALES: ["purchase", "offsite_conversion.fb_pixel_purchase"],
  STORE_VISITS: ["store_visit"],
};

/** Usado quando o objetivo da campanha nao veio ou nao e reconhecido - mesma ideia da
 * lista antiga (acao de conversao mais valiosa primeiro), mas escolhendo UMA em vez de
 * somar todas, pra nunca contar em dobro. */
const FALLBACK_ACTION_PRIORITY = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "onsite_conversion.messaging_conversation_started_7d",
  "link_click",
];

export interface MetaActionEntry {
  action_type: string;
  value: string | number;
}

export interface ResultMetric {
  /** Quantidade de resultados - o mesmo numero que a coluna "Resultados" do Gerenciador. */
  value: number;
  /** Qual tipo de acao foi contado (ex: "lead", "link_click") - guardado junto pra dar
   * pra auditar depois de onde veio o numero, em vez de so um total sem contexto. */
  resultType: string | null;
  /** true quando o objetivo nao foi reconhecido e caiu na lista de fallback - deixa
   * explicito que o numero pode nao bater exatamente com o Gerenciador nesse caso. */
  usedFallback: boolean;
}

/**
 * Escolhe e conta o resultado de UMA campanha/anuncio a partir das actions devolvidas
 * pela API, usando o objetivo da campanha pra saber o que conta como resultado.
 */
export function resolveResultMetric(
  actions: MetaActionEntry[] | undefined | null,
  objective: string | null | undefined
): ResultMetric {
  if (!actions || actions.length === 0) {
    return { value: 0, resultType: null, usedFallback: false };
  }

  const normalizedObjective = objective?.toUpperCase() ?? "";
  const preferred = OBJECTIVE_ACTION_PRIORITY[normalizedObjective];
  const usedFallback = !preferred;
  const priority = preferred ?? FALLBACK_ACTION_PRIORITY;

  for (const actionType of priority) {
    const match = actions.find((action) => action.action_type === actionType);
    if (match) {
      return { value: Number(match.value) || 0, resultType: actionType, usedFallback };
    }
  }

  return { value: 0, resultType: null, usedFallback };
}
