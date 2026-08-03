import type { PlatformCredential } from "./types";

const GRAPH_API_VERSION = "v21.0";

/**
 * Camada de Publicos Personalizados (Custom Audiences) da Meta - base para a esteira de
 * frio/morno/quente/remarketing/1% pedida na spec de gestao de trafego. So cobre o que
 * foi CONFIRMADO na documentacao oficial da Meta (formato literal de cURL/JSON copiado
 * das paginas de referencia): criar audience CUSTOM (semente pra lookalike ou base pra
 * popular por fora), criar LOOKALIKE a partir de uma audience existente, listar, ler e
 * apagar.
 *
 * O QUE FALTA DE PROPOSITO: criar audience de subtype ENGAGEMENT baseada em visualizacao
 * de video especifico (o mecanismo exato que moveria lead de "viu o video do frio" pra
 * "morno" automaticamente). O formato exato do campo `rule` pra esse caso (event_sources
 * tipo VIDEO, filtro de percentual assistido) nao apareceu de forma confiavel na
 * documentacao oficial nas paginas consultadas - nao adivinhei esse formato pra nao
 * arriscar criar um publico malformado (ou o Meta aceitar e o publico nunca popular
 * ninguem, o que e pior que dar erro na hora). Fica pendente de confirmacao - seja por
 * uma fonte de doc melhor, seja lendo de volta (GET com fields=rule) um publico de video
 * criado manualmente no Gerenciador de Anuncios, que revela o formato real que a propria
 * Meta usa.
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
