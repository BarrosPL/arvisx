import type { PlatformCredential } from "./types";

const GRAPH_API_VERSION = "v21.0";

/**
 * Camada de Publicos Personalizados (Custom Audiences) da Meta - base para a esteira de
 * frio/morno/quente/remarketing/1% pedida na spec de gestao de trafego. So cobre o que
 * foi CONFIRMADO na documentacao oficial da Meta (formato literal de cURL/JSON copiado
 * das paginas de referencia):
 * - criar audience CUSTOM (semente pra lookalike ou base pra popular por fora)
 * - criar LOOKALIKE a partir de uma audience existente ("1%" da spec)
 * - criar audience de ENGAJAMENTO por Pagina/Lead Ad/Instagram/Instant Experience/
 *   Shopping/AR, com inclusao E exclusao na mesma regra (createMetaEngagementAudience)
 * - listar, ler e apagar
 *
 * O QUE FALTA DE PROPOSITO: audience de engajamento por VIDEO ESPECIFICO (o mecanismo
 * exato que moveria lead de "viu o video do frio" pra "morno" automaticamente, com
 * granularidade por criativo e percentual assistido). A doc oficial confirma que "video"
 * e uma fonte de evento separada (existe no produto, Gerenciador de Anuncios oferece
 * "Video" como opcao de Engajamento), mas a pagina de referencia consultada ate agora
 * ("Engagement Custom Audiences") so documenta em detalhe Page/Lead/IG/Canvas/Shopping/AR
 * - video e so citado de passagem, sem o `type` de event_source nem o vocabulario de
 * filtro (percentual assistido). Nao adivinhei esse formato pra nao arriscar criar um
 * publico malformado (ou pior: o Meta aceitar e o publico nunca popular ninguem, que
 * falha em silencio). Ate isso ser confirmado, PAGE_ENGAGEMENT_EVENTS.ENGAGED e o proxy
 * mais proximo disponivel pra "Frio" (quem interagiu com a marca, nao especificamente
 * com o video do gancho X).
 */

interface MetaApiErrorResponse {
  error?: { message: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

function formatMetaApiError(body: MetaApiErrorResponse, response: Response): string {
  const error = body.error;
  if (!error) return response.statusText;
  const parts = [`(#${error.code ?? "?"}${error.error_subcode ? `/${error.error_subcode}` : ""}) ${error.message}`];
  if (error.type) parts.push(`tipo: ${error.type}`);
  if (error.fbtrace_id) parts.push(`fbtrace_id: ${error.fbtrace_id}`);
  return parts.join(" | ");
}

function toAccountId(externalAccountId: string): string {
  return externalAccountId.startsWith("act_") ? externalAccountId : `act_${externalAccountId}`;
}

export interface MetaCustomAudienceSummary {
  id: string;
  name: string;
  subtype: string;
  approximateCount: number | null;
  deliveryStatus: string | null;
  operationStatus: string | null;
}

export interface ListAudiencesResult {
  ok: boolean;
  audiences: MetaCustomAudienceSummary[];
  errorMessage?: string;
}

interface MetaCustomAudienceRow {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  delivery_status?: { code: number; description: string };
  operation_status?: { code: number; description: string };
}

const AUDIENCE_FIELDS =
  "id,name,subtype,approximate_count_lower_bound,delivery_status,operation_status";

/** Lista os publicos personalizados ja existentes na conta - usado pela JAMILE antes de
 * propor um novo, pra nao recriar um que ja existe (ex: "Engajados - <marca> - 180d"). */
export async function listMetaCustomAudiences(credential: PlatformCredential): Promise<ListAudiencesResult> {
  const account = toAccountId(credential.externalAccountId);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${account}/customaudiences?limit=200&fields=${AUDIENCE_FIELDS}&access_token=${encodeURIComponent(credential.accessToken)}`
    );
    const result = (await response.json()) as MetaApiErrorResponse & { data?: MetaCustomAudienceRow[] };
    if (!response.ok || result.error) {
      return { ok: false, audiences: [], errorMessage: formatMetaApiError(result, response) };
    }
    return {
      ok: true,
      audiences: (result.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        subtype: row.subtype,
        approximateCount: row.approximate_count_lower_bound ?? null,
        deliveryStatus: row.delivery_status?.description ?? null,
        operationStatus: row.operation_status?.description ?? null,
      })),
    };
  } catch (error) {
    return { ok: false, audiences: [], errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface CreateAudienceResult {
  ok: boolean;
  audienceId?: string;
  errorMessage?: string;
}

/**
 * Eventos de engajamento com PAGINA confirmados na doc oficial ("Engagement Custom
 * Audiences"). page_engaged e o mais abrangente (inclui todos os outros) - serve hoje
 * como o proxy mais proximo de "Frio" da spec (quem interagiu com a marca) enquanto o
 * formato de audience por VIDEO especifico nao e confirmado (ver nota no topo do
 * arquivo). page_liked e especial: so ele aceita retentionSeconds=0 (sem expirar) e nao
 * pode ser combinado com outro evento na mesma regra - a Meta rejeita a combinacao.
 */
export const PAGE_ENGAGEMENT_EVENTS = {
  ENGAGED: "page_engaged",
  VISITED: "page_visited",
  LIKED: "page_liked",
  MESSAGED: "page_messaged",
  CTA_CLICKED: "page_cta_clicked",
  SAVED: "page_or_post_save",
  POST_INTERACTION: "page_post_interaction",
} as const;

/** Maximo de retencao por fonte, em DIAS - a Meta rejeita valor acima disso (exceto
 * Page Likes, que e sempre 0/sem expirar). Confirmado na doc oficial. Nao e uma decisao
 * de produto, e o teto que a propria Meta aplica; validar aqui da um erro claro em vez
 * de deixar a chamada falhar la na Meta sem essa explicacao. */
export const ENGAGEMENT_MAX_RETENTION_DAYS: Record<string, number> = {
  page: 730,
  ig_business: 730,
  canvas: 730,
  lead: 90,
  ig_lead_generation: 90,
  shopping_page: 365,
  shopping_ig: 365,
  ar_experience: 365,
  ar_effects: 365,
};

export interface AudienceEventFilter {
  field: string;
  operator: string;
  value: string;
}

export interface AudienceEngagementRule {
  /** Tipo confirmado na doc: "page", "lead", "ig_lead_generation", "canvas",
   * "ig_business", "shopping_page", "shopping_ig", "ar_experience", "ar_effects". Cada
   * fonte tem seu proprio vocabulario de eventos (ver PAGE_ENGAGEMENT_EVENTS pra page). */
  eventSourceType: string;
  eventSourceIds: string[];
  retentionDays: number;
  /** Filtros combinados com AND (mesmo formato confirmado na doc: {field, operator, value}).
   * O caso comum e um so filtro `{field: "event", operator: "eq", value: <evento>}`. */
  filters: AudienceEventFilter[];
}

function buildEngagementRuleJson(rule: AudienceEngagementRule) {
  return {
    event_sources: rule.eventSourceIds.map((id) => ({ id, type: rule.eventSourceType })),
    retention_seconds: rule.retentionDays * 86400,
    filter: { operator: "and", filters: rule.filters },
  };
}

/**
 * Cria um publico de ENGAJAMENTO (Pagina, Lead Ad, Instagram, Instant Experience,
 * Shopping, AR) - formato confirmado na doc oficial ("Engagement Custom Audiences"),
 * copiado literalmente: `rule.inclusions.rules[]` (OR entre regras) e
 * `rule.exclusions.rules[]` opcional (mesmo formato, ex: "engajou com a Pagina MAS
 * exclui quem ja clicou o CTA" - e o mecanismo de exclusao embutido NA PROPRIA
 * audience, diferente de excluded_custom_audiences no targeting do AdSet, que exclui
 * publicos inteiros ja existentes de OUTRO conjunto).
 *
 * NAO cobre engajamento por VIDEO especifico (ver nota no topo do arquivo) - so as
 * fontes de evento listadas no tipo AudienceEngagementRule.eventSourceType.
 */
export async function createMetaEngagementAudience(
  credential: PlatformCredential,
  params: { name: string; inclusionRules: AudienceEngagementRule[]; exclusionRules?: AudienceEngagementRule[]; prefill?: boolean }
): Promise<CreateAudienceResult> {
  const account = toAccountId(credential.externalAccountId);

  for (const rule of [...params.inclusionRules, ...(params.exclusionRules ?? [])]) {
    const max = ENGAGEMENT_MAX_RETENTION_DAYS[rule.eventSourceType];
    if (max !== undefined && rule.retentionDays > max) {
      return {
        ok: false,
        errorMessage: `retentionDays=${rule.retentionDays} excede o maximo da Meta para "${rule.eventSourceType}" (${max} dias)`,
      };
    }
  }

  const ruleJson: Record<string, unknown> = {
    inclusions: { operator: "or", rules: params.inclusionRules.map(buildEngagementRuleJson) },
  };
  if (params.exclusionRules && params.exclusionRules.length > 0) {
    ruleJson.exclusions = { operator: "or", rules: params.exclusionRules.map(buildEngagementRuleJson) };
  }

  const body = {
    name: params.name,
    rule: JSON.stringify(ruleJson),
    prefill: params.prefill === false ? "0" : "1",
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${account}/customaudiences?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      return { ok: false, errorMessage: formatMetaApiError(result, response) };
    }
    return { ok: true, audienceId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Cria um publico personalizado do tipo CUSTOM (subtype confirmado na doc oficial).
 * Serve como base "semente" pra uma Lookalike (createMetaLookalikeAudience precisa de
 * um originAudienceId com pelo menos 100 pessoas) ou como publico vazio a ser
 * populado por outro meio depois.
 *
 * retentionDays (1-180): por quanto tempo alguem fica no publico apos a ultima acao
 * que o incluiu - e o parametro que materializa as janelas de 20/60/120 dias da spec
 * de remarketing (ver evaluateProposalReadiness/spec-gestor-trafego-ia.md secao 2).
 * Omitido = retencao "infinita" no lado da Meta.
 */
export async function createMetaCustomAudience(
  credential: PlatformCredential,
  params: { name: string; description?: string; retentionDays?: number }
): Promise<CreateAudienceResult> {
  const account = toAccountId(credential.externalAccountId);
  const body: Record<string, unknown> = {
    name: params.name,
    subtype: "CUSTOM",
    customer_file_source: "USER_PROVIDED_ONLY",
  };
  if (params.description) body.description = params.description;
  if (params.retentionDays !== undefined) body.retention_days = params.retentionDays;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${account}/customaudiences?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      return { ok: false, errorMessage: formatMetaApiError(result, response) };
    }
    return { ok: true, audienceId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Cria uma Lookalike a partir de uma audience semente - e o "1%" da spec. Formato
 * confirmado na doc oficial da Meta (subtype LOOKALIKE, lookalike_spec com type
 * "similarity"/"reach" OU ratio 0.01-0.20).
 *
 * A semente (originAudienceId) precisa ter pelo menos 100 pessoas - a Meta rejeita
 * antes disso. Nao valido esse minimo aqui de proposito: quem sabe o approximateCount
 * real da semente e o approximateCount devolvido por listMetaCustomAudiences/
 * getMetaCustomAudience, nao esta funcao - duplicar a checagem aqui so criaria uma
 * segunda fonte de verdade que pode ficar desatualizada.
 */
export async function createMetaLookalikeAudience(
  credential: PlatformCredential,
  params: { name: string; originAudienceId: string; country: string; ratio?: number }
): Promise<CreateAudienceResult> {
  const account = toAccountId(credential.externalAccountId);
  const lookalikeSpec =
    params.ratio !== undefined
      ? { ratio: params.ratio, country: params.country }
      : { type: "similarity", country: params.country };

  const body = {
    name: params.name,
    subtype: "LOOKALIKE",
    origin_audience_id: params.originAudienceId,
    lookalike_spec: JSON.stringify(lookalikeSpec),
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${account}/customaudiences?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      return { ok: false, errorMessage: formatMetaApiError(result, response) };
    }
    return { ok: true, audienceId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface DeleteAudienceResult {
  ok: boolean;
  errorMessage?: string;
}

/** Apaga um publico personalizado. Chamado so depois de confirmacao - apagar um
 * publico que ainda esta em uso como targeting/exclusao de um AdSet ativo pode fazer o
 * AdSet parar de entregar. */
export async function deleteMetaCustomAudience(
  credential: PlatformCredential,
  audienceId: string
): Promise<DeleteAudienceResult> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${audienceId}?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "DELETE" }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { success?: boolean };
    if (!response.ok || result.error || result.success === false) {
      return { ok: false, errorMessage: formatMetaApiError(result, response) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
