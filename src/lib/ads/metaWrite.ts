import type { PlatformCredential } from "./types";

const GRAPH_API_VERSION = "v21.0";

export interface WriteResult {
  ok: boolean;
  raw?: unknown;
  errorMessage?: string;
}

export type BudgetLevel = "ADSET" | "CAMPAIGN";

export interface BudgetReadResult {
  dailyBudgetMinorUnits: number | null;
  /** Onde a verba realmente mora - CBO (Campaign Budget Optimization) põe a verba na
   * campanha, não no AdSet, e nesse caso o AdSet não tem daily_budget nenhum. */
  level: BudgetLevel | null;
  campaignId: string | null;
  errorMessage?: string;
}

interface MetaApiErrorResponse {
  error?: { message: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

/** Monta a mensagem de erro com TODO o detalhe que o Meta manda (subcode/tipo/trace id
 * inclusos) - o campo "message" sozinho costuma ser generico demais pra diagnosticar
 * (ex: erros de OAuthException tipo "#240 Requires a valid user..." nao dizem o motivo
 * real sem o subcode). Usada em toda chamada de escrita deste arquivo. */
function formatMetaApiError(body: MetaApiErrorResponse, response: Response): string {
  const error = body.error;
  if (!error) return response.statusText;
  const parts = [`(#${error.code ?? "?"}${error.error_subcode ? `/${error.error_subcode}` : ""}) ${error.message}`];
  if (error.type) parts.push(`tipo: ${error.type}`);
  if (error.fbtrace_id) parts.push(`fbtrace_id: ${error.fbtrace_id}`);
  return parts.join(" | ");
}

/**
 * Pausa ou ativa um anuncio (o status mora no proprio anuncio no Meta, diferente da
 * verba que mora no AdSet ou na campanha). Unica funcao do sistema que chama esse
 * endpoint - so lib/execution/executor.ts pode invocar isso, e so depois de aprovacao.
 */
export async function setMetaAdStatus(
  credential: PlatformCredential,
  adId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<WriteResult> {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${adId}` +
    `?status=${status}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json()) as MetaApiErrorResponse & { success?: boolean };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${formatMetaApiError(body, response)}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Pausa ou ativa a CAMPANHA inteira (nao um anuncio especifico dentro dela) - o status
 * de campanha e um campo proprio no Graph API, igual ao de anuncio (mesmo endpoint,
 * so muda o id do objeto). Usada quando o usuario pede pra pausar/ativar "a campanha"
 * em vez de um anuncio especifico - lib/execution/executor.ts decide qual das duas
 * chamar (esta ou setMetaAdStatus) com base em qual id a proposta tem preenchido.
 */
export async function setMetaCampaignStatus(
  credential: PlatformCredential,
  campaignId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<WriteResult> {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${campaignId}` +
    `?status=${status}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json()) as MetaApiErrorResponse & { success?: boolean };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${formatMetaApiError(body, response)}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Pausa ou ativa o CONJUNTO DE ANUNCIOS inteiro (AdSet - nao um anuncio especifico
 * dentro dele, nem a campanha toda). Mesmo endpoint generico de status do Graph API,
 * so muda o id do objeto. Usada quando o usuario pede pra pausar/ativar "o conjunto"
 * em vez de um anuncio ou da campanha inteira - lib/execution/executor.ts decide qual
 * das 3 (esta, setMetaAdStatus ou setMetaCampaignStatus) chamar com base em qual id a
 * proposta tem preenchido.
 */
export async function setMetaAdSetStatus(
  credential: PlatformCredential,
  adSetId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<WriteResult> {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${adSetId}` +
    `?status=${status}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json()) as MetaApiErrorResponse & { success?: boolean };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${formatMetaApiError(body, response)}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

async function fetchBudgetFields(
  credential: PlatformCredential,
  id: string,
  extraFields: string
): Promise<{ dailyBudget?: string; lifetimeBudget?: string; extra?: Record<string, unknown>; errorMessage?: string }> {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${id}` +
    `?fields=daily_budget,lifetime_budget${extraFields}&access_token=${encodeURIComponent(credential.accessToken)}`;
  try {
    const response = await fetch(url);
    const body = (await response.json()) as MetaApiErrorResponse & {
      daily_budget?: string;
      lifetime_budget?: string;
      [key: string]: unknown;
    };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${formatMetaApiError(body, response)}`);
    }
    return { dailyBudget: body.daily_budget, lifetimeBudget: body.lifetime_budget, extra: body };
  } catch (error) {
    return { errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Le a verba diaria real de um anuncio, tentando primeiro o AdSet e, se ele nao tiver
 * orcamento proprio (campanha com Campaign Budget Optimization/CBO - comum, e o caso
 * real testado nesta conta), cai pra verba da campanha-mae. Retorna tambem o nivel e o
 * campaignId, pra escrever no mesmo lugar depois (setMetaBudget).
 */
export async function getMetaBudget(credential: PlatformCredential, adSetId: string): Promise<BudgetReadResult> {
  const adSet = await fetchBudgetFields(credential, adSetId, ",campaign{id}");
  if (adSet.errorMessage) {
    return { dailyBudgetMinorUnits: null, level: null, campaignId: null, errorMessage: adSet.errorMessage };
  }

  const campaignId = (adSet.extra?.campaign as { id?: string } | undefined)?.id ?? null;
  const adSetRaw = adSet.dailyBudget ?? adSet.lifetimeBudget;
  if (adSetRaw !== undefined) {
    return { dailyBudgetMinorUnits: Number(adSetRaw), level: "ADSET", campaignId };
  }

  if (!campaignId) {
    return { dailyBudgetMinorUnits: null, level: null, campaignId: null };
  }

  const campaign = await fetchBudgetFields(credential, campaignId, "");
  if (campaign.errorMessage) {
    return { dailyBudgetMinorUnits: null, level: null, campaignId, errorMessage: campaign.errorMessage };
  }
  const campaignRaw = campaign.dailyBudget ?? campaign.lifetimeBudget;
  if (campaignRaw !== undefined) {
    return { dailyBudgetMinorUnits: Number(campaignRaw), level: "CAMPAIGN", campaignId };
  }

  return { dailyBudgetMinorUnits: null, level: null, campaignId };
}

/** Define a verba diaria nova, em centavos, no MESMO nivel (AdSet ou Campanha) de onde ela foi lida. */
export async function setMetaBudget(
  credential: PlatformCredential,
  target: { level: BudgetLevel; adSetId: string; campaignId: string | null },
  dailyBudgetMinorUnits: number
): Promise<WriteResult> {
  const targetId = target.level === "CAMPAIGN" ? target.campaignId : target.adSetId;
  if (!targetId) {
    return { ok: false, errorMessage: "Nao foi possivel determinar onde a verba mora (AdSet ou Campanha)" };
  }

  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${targetId}` +
    `?daily_budget=${Math.round(dailyBudgetMinorUnits)}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json()) as MetaApiErrorResponse & { success?: boolean };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${formatMetaApiError(body, response)}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface MetaAdDetails {
  creativeId: string | null;
  adSetId: string | null;
  adSetName: string | null;
  campaignId: string | null;
  targeting: unknown;
  billingEvent: string | null;
  optimizationGoal: string | null;
  bidStrategy: string | null;
  errorMessage?: string;
}

/** Le tudo que precisa copiar pra duplicar um anuncio (usado no teste A/B - ver duplicateMetaAdWithBudget). */
async function getMetaAdDetails(credential: PlatformCredential, adId: string): Promise<MetaAdDetails> {
  const fields =
    "creative{id},adset{id,name,targeting,billing_event,optimization_goal,bid_strategy,campaign_id}";
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${adId}` +
    `?fields=${fields}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url);
    const body = (await response.json()) as MetaApiErrorResponse & {
      creative?: { id?: string };
      adset?: {
        id?: string;
        name?: string;
        targeting?: unknown;
        billing_event?: string;
        optimization_goal?: string;
        bid_strategy?: string;
        campaign_id?: string;
      };
    };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${formatMetaApiError(body, response)}`);
    }
    return {
      creativeId: body.creative?.id ?? null,
      adSetId: body.adset?.id ?? null,
      adSetName: body.adset?.name ?? null,
      campaignId: body.adset?.campaign_id ?? null,
      targeting: body.adset?.targeting ?? null,
      billingEvent: body.adset?.billing_event ?? null,
      optimizationGoal: body.adset?.optimization_goal ?? null,
      bidStrategy: body.adset?.bid_strategy ?? null,
    };
  } catch (error) {
    return {
      creativeId: null,
      adSetId: null,
      adSetName: null,
      campaignId: null,
      targeting: null,
      billingEvent: null,
      optimizationGoal: null,
      bidStrategy: null,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export interface DuplicateAdResult {
  ok: boolean;
  newAdSetId?: string;
  newAdId?: string;
  raw?: unknown;
  errorMessage?: string;
}

function toAccountId(externalAccountId: string): string {
  return externalAccountId.startsWith("act_") ? externalAccountId : `act_${externalAccountId}`;
}

/**
 * Duplica um anuncio real com verba diferente, pra rodar um teste A/B de verdade:
 * cria um AdSet novo (mesma segmentacao/otimizacao do original, verba testada) e um
 * Ad novo reaproveitando o creative_id original (sem reenviar imagem/texto). E uma
 * escrita real na conta - so chamado por lib/execution/executor.ts, depois de
 * aprovacao humana.
 */
export async function duplicateMetaAdWithBudget(
  credential: PlatformCredential,
  params: { adId: string; newDailyBudgetMinorUnits: number; endsAt: Date }
): Promise<DuplicateAdResult> {
  const details = await getMetaAdDetails(credential, params.adId);
  if (details.errorMessage || !details.adSetId || !details.creativeId || !details.campaignId) {
    return {
      ok: false,
      errorMessage: details.errorMessage ?? "Não foi possível ler os dados completos do anúncio original",
    };
  }

  const accountId = toAccountId(credential.externalAccountId);

  try {
    const adSetBody: Record<string, unknown> = {
      name: `${details.adSetName ?? "AdSet"} — Teste A/B verba`,
      campaign_id: details.campaignId,
      daily_budget: Math.round(params.newDailyBudgetMinorUnits),
      targeting: details.targeting,
      status: "ACTIVE",
      end_time: Math.floor(params.endsAt.getTime() / 1000),
    };
    if (details.billingEvent) adSetBody.billing_event = details.billingEvent;
    if (details.optimizationGoal) adSetBody.optimization_goal = details.optimizationGoal;
    if (details.bidStrategy) adSetBody.bid_strategy = details.bidStrategy;

    const adSetResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/adsets?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adSetBody) }
    );
    const adSetResult = (await adSetResponse.json()) as MetaApiErrorResponse & { id?: string };
    if (!adSetResponse.ok || adSetResult.error || !adSetResult.id) {
      throw new Error(`Meta API error (criar AdSet): ${adSetResult.error?.message ?? adSetResponse.statusText}`);
    }
    const newAdSetId = adSetResult.id;

    const adBody = {
      name: `Teste A/B — verba`,
      adset_id: newAdSetId,
      creative: { creative_id: details.creativeId },
      status: "ACTIVE",
    };
    const adResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/ads?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adBody) }
    );
    const adResult = (await adResponse.json()) as MetaApiErrorResponse & { id?: string };
    if (!adResponse.ok || adResult.error || !adResult.id) {
      throw new Error(`Meta API error (criar Ad): ${adResult.error?.message ?? adResponse.statusText}`);
    }

    return { ok: true, newAdSetId, newAdId: adResult.id, raw: { adSetResult, adResult } };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

// ---------------------------------------------------------------------------
// Criacao de campanha nova do zero (NEW_CAMPAIGN) - criativo/segmentacao escritos pela
// JAMILE (nao clonados de um anuncio existente, diferente de duplicateMetaAdWithBudget
// acima). So chamadas por lib/execution/executor.ts, na ordem: uploadMetaAdImage ->
// resolveMetaPageId -> searchMetaInterests (por interesse) -> createMetaCampaign ->
// createMetaAdSet -> createMetaAdCreative -> createMetaAd.
// ---------------------------------------------------------------------------

export interface MetaInterest {
  id: string;
  name: string;
}

/** Resolve uma palavra-chave de interesse (texto livre, em portugues) pro ID real que a
 * Graph API exige em targeting.flexible_spec - ela nao aceita texto livre diretamente.
 * Pega o primeiro resultado devolvido pela propria busca da Meta (sem garantia de match
 * semantico perfeito - e o que a Meta considera mais relevante pra aquele texto). */
export async function searchMetaInterests(credential: PlatformCredential, query: string): Promise<MetaInterest[]> {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/search` +
    `?type=adinterest&q=${encodeURIComponent(query)}&access_token=${encodeURIComponent(credential.accessToken)}`;
  const response = await fetch(url);
  const body = (await response.json()) as MetaApiErrorResponse & { data?: { id: string; name: string }[] };
  if (!response.ok || body.error) {
    throw new Error(`Meta API error (buscar interesse "${query}"): ${body.error?.message ?? response.statusText}`);
  }
  return body.data ?? [];
}

/** Sobe uma imagem pra biblioteca de midia da conta (POST /adimages, aceita bytes base64
 * direto num corpo JSON comum - sem precisar de multipart). Devolve o image_hash exigido
 * por createMetaAdCreative. */
export async function uploadMetaAdImage(
  credential: PlatformCredential,
  base64Data: string
): Promise<{ ok: boolean; imageHash?: string; errorMessage?: string }> {
  const accountId = toAccountId(credential.externalAccountId);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/adimages?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bytes: base64Data }) }
    );
    const body = (await response.json()) as MetaApiErrorResponse & {
      images?: Record<string, { hash?: string }>;
    };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error (subir imagem): ${body.error?.message ?? response.statusText}`);
    }
    const imageHash = Object.values(body.images ?? {})[0]?.hash;
    if (!imageHash) {
      throw new Error("Meta API nao devolveu image_hash para a imagem enviada");
    }
    return { ok: true, imageHash };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Sobe um video pra biblioteca de midia da conta (POST /advideos). Diferente de
 * uploadMetaAdImage: o campo `source` e documentado pela Meta como "o video, codificado
 * como form data" - upload multipart, nao JSON com base64 (mecanica confirmada na
 * tabela de parametros oficial do endpoint /advideos, mesmo sem exemplo de codigo
 * literal na doc consultada). Devolve o video_id exigido por createMetaVideoAdCreative.
 *
 * So cobre upload de arquivo pequeno numa chamada so - a Meta documenta um modo de
 * upload em pedacos (upload_phase/upload_session_id/start_offset/end_offset) pra
 * arquivo grande, que NAO esta implementado aqui (nao confirmado o fluxo completo).
 * Video de anuncio real costuma ser pequeno o bastante pra isto bastar; se a Meta
 * comecar a rejeitar por tamanho, e o sinal de que o modo em pedacos precisa entrar.
 */
export async function uploadMetaAdVideo(
  credential: PlatformCredential,
  params: { base64Data: string; mimeType: string; title?: string }
): Promise<{ ok: boolean; videoId?: string; errorMessage?: string }> {
  const accountId = toAccountId(credential.externalAccountId);
  try {
    const bytes = Buffer.from(params.base64Data, "base64");
    const form = new FormData();
    form.append("source", new Blob([bytes], { type: params.mimeType }), "video");
    if (params.title) form.append("title", params.title);

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/advideos?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", body: form }
    );
    const body = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || body.error || !body.id) {
      throw new Error(`Meta API error (subir video): ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true, videoId: body.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/** Busca a(s) Pagina(s) do Facebook associada(s) a conta de anuncio - obrigatoria pra
 * criar um Ad Creative (object_story_spec.page_id). Falha com erro claro se nao achar
 * nenhuma ou achar mais de uma (nao adivinha qual usar). */
export async function resolveMetaPageId(
  credential: PlatformCredential
): Promise<{ ok: boolean; pageId?: string; errorMessage?: string }> {
  const accountId = toAccountId(credential.externalAccountId);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/promote_pages?access_token=${encodeURIComponent(credential.accessToken)}`
    );
    const body = (await response.json()) as MetaApiErrorResponse & { data?: { id: string; name?: string }[] };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error (buscar Pagina da conta): ${body.error?.message ?? response.statusText}`);
    }
    const pages = body.data ?? [];
    if (pages.length === 0) {
      throw new Error("Nenhuma Pagina do Facebook associada a esta conta de anuncio - conecte uma antes de criar campanha");
    }
    if (pages.length > 1) {
      throw new Error(
        `Mais de uma Pagina associada a conta (${pages.map((p) => p.name ?? p.id).join(", ")}) - nao e possivel escolher automaticamente`
      );
    }
    return { ok: true, pageId: pages[0].id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface CreateCampaignResult {
  ok: boolean;
  campaignId?: string;
  errorMessage?: string;
}

/** Cria a Campanha em si - objetivo fixo em trafego (sem Pixel/Conversions API
 * configurado em lugar nenhum do sistema hoje, nao ha como suportar otimizacao por
 * conversao/lead direito). Nasce ACTIVE - a aprovacao humana ja aconteceu antes do
 * Executar chamar isto, igual todo o resto do sistema. */
export async function createMetaCampaign(
  credential: PlatformCredential,
  params: { name: string; dailyBudgetMinorUnits: number; status?: "ACTIVE" | "PAUSED" }
): Promise<CreateCampaignResult> {
  const accountId = toAccountId(credential.externalAccountId);
  const body = {
    name: params.name,
    objective: "OUTCOME_TRAFFIC",
    status: params.status ?? "ACTIVE",
    special_ad_categories: [],
    daily_budget: Math.round(params.dailyBudgetMinorUnits),
  };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/campaigns?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      throw new Error(`Meta API error (criar Campanha): ${result.error?.message ?? response.statusText}`);
    }
    return { ok: true, campaignId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface MetaAdSetTargeting {
  countries: string[];
  ageMin: number;
  ageMax: number;
  interestIds: string[];
  /** Inclui gente desses publicos personalizados (ex: lookalike 1%, ou quem engajou
   * com o morno pra alcancar no quente). Formato confirmado na doc oficial da Meta:
   * lista de ids numericos aceita direto em `custom_audiences`. */
  customAudienceIds?: string[];
  /** Nega quem esta nesses publicos - e o mecanismo que implementa "ja viu, nao
   * converteu, nao mostra de novo" (spec-gestor-trafego-ia.md secao 2/5): o AdSet de
   * Morno recebe aqui o publico de quem ja esta em Frio, e assim por diante. */
  excludedCustomAudienceIds?: string[];
}

export interface CreateAdSetResult {
  ok: boolean;
  adSetId?: string;
  errorMessage?: string;
}

/** Cria o AdSet dentro da campanha ja criada - orcamento fica so na campanha (CBO),
 * otimizacao fixa em cliques no link (mesmo motivo do objetivo em createMetaCampaign). */
export async function createMetaAdSet(
  credential: PlatformCredential,
  params: { campaignId: string; name: string; targeting: MetaAdSetTargeting; status?: "ACTIVE" | "PAUSED" }
): Promise<CreateAdSetResult> {
  const accountId = toAccountId(credential.externalAccountId);
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: params.targeting.countries },
    age_min: params.targeting.ageMin,
    age_max: params.targeting.ageMax,
  };
  if (params.targeting.interestIds.length > 0) {
    targeting.flexible_spec = [{ interests: params.targeting.interestIds.map((id) => ({ id })) }];
  }
  if (params.targeting.customAudienceIds && params.targeting.customAudienceIds.length > 0) {
    targeting.custom_audiences = params.targeting.customAudienceIds.map((id) => ({ id }));
  }
  if (params.targeting.excludedCustomAudienceIds && params.targeting.excludedCustomAudienceIds.length > 0) {
    targeting.excluded_custom_audiences = params.targeting.excludedCustomAudienceIds.map((id) => ({ id }));
  }
  const body = {
    name: params.name,
    campaign_id: params.campaignId,
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    targeting,
    status: params.status ?? "ACTIVE",
  };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/adsets?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      throw new Error(`Meta API error (criar AdSet): ${result.error?.message ?? response.statusText}`);
    }
    return { ok: true, adSetId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface CreateAdCreativeResult {
  ok: boolean;
  creativeId?: string;
  errorMessage?: string;
}

/** Cria o objeto de criativo (imagem + texto) - obrigatorio ter o page_id (ver
 * resolveMetaPageId) e o image_hash (ver uploadMetaAdImage) antes de chamar isto. */
export async function createMetaAdCreative(
  credential: PlatformCredential,
  params: {
    pageId: string;
    imageHash: string;
    headline: string;
    primaryText: string;
    description: string;
    callToAction: string;
    linkUrl: string;
  }
): Promise<CreateAdCreativeResult> {
  const accountId = toAccountId(credential.externalAccountId);
  const body = {
    name: params.headline,
    object_story_spec: {
      page_id: params.pageId,
      link_data: {
        image_hash: params.imageHash,
        link: params.linkUrl,
        message: params.primaryText,
        name: params.headline,
        description: params.description,
        call_to_action: { type: params.callToAction, value: { link: params.linkUrl } },
      },
    },
  };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/adcreatives?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      throw new Error(`Meta API error (criar Ad Creative): ${result.error?.message ?? response.statusText}`);
    }
    return { ok: true, creativeId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Cria o objeto de criativo em formato VIDEO (video_data) - contraparte de
 * createMetaAdCreative (que so cobre imagem/link_data). Formato confirmado por dois
 * exemplos literais na doc oficial (guia "Video Ads"): video_id, image_url (thumbnail),
 * call_to_action.value.link, link_description.
 *
 * PENDENCIA REAL, nao adivinhada: video_data exige `image_url` (uma URL publica de
 * thumbnail), nao `image_hash` como o caminho de imagem usa - a doc consultada nunca
 * mostrou image_hash como alternativa aceita aqui, entao nao assumi que funciona.
 * Isso empurra uma pergunta de arquitetura pra quem for ligar isto no fluxo de
 * proposta/execucao: de onde vem essa URL publica? O video recem-enviado nao tem uma
 * thumbnail pronta na hora (processamento e assincrono do lado da Meta) - portanto
 * `thumbnailImageUrl` e OBRIGATORIO e fornecido por quem chama, em vez desta funcao
 * tentar descobrir/gerar uma sozinha.
 *
 * Tambem confirmado como AUSENTE em video_data (verificado explicitamente na doc): nao
 * ha campo "message" nem "title" pra texto principal do anuncio (o que link_data.message
 * cobre no caminho de imagem) - por isso esta funcao nao aceita "primaryText": nao existe
 * onde colocar esse texto dentro de video_data segundo a doc consultada.
 */
export async function createMetaVideoAdCreative(
  credential: PlatformCredential,
  params: {
    pageId: string;
    videoId: string;
    thumbnailImageUrl: string;
    linkDescription: string;
    callToAction: string;
    linkUrl: string;
    name: string;
  }
): Promise<CreateAdCreativeResult> {
  const accountId = toAccountId(credential.externalAccountId);
  const body = {
    name: params.name,
    object_story_spec: {
      page_id: params.pageId,
      video_data: {
        video_id: params.videoId,
        image_url: params.thumbnailImageUrl,
        link_description: params.linkDescription,
        call_to_action: { type: params.callToAction, value: { link: params.linkUrl } },
      },
    },
  };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/adcreatives?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      throw new Error(`Meta API error (criar Ad Creative de video): ${result.error?.message ?? response.statusText}`);
    }
    return { ok: true, creativeId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface CreateAdResult {
  ok: boolean;
  adId?: string;
  errorMessage?: string;
}

/** Ultimo passo: liga o AdSet + Creative num Anuncio de verdade, ja ACTIVE. */
export async function createMetaAd(
  credential: PlatformCredential,
  params: { adSetId: string; creativeId: string; name: string; status?: "ACTIVE" | "PAUSED" }
): Promise<CreateAdResult> {
  const accountId = toAccountId(credential.externalAccountId);
  const body = {
    name: params.name,
    adset_id: params.adSetId,
    creative: { creative_id: params.creativeId },
    status: params.status ?? "ACTIVE",
  };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/ads?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = (await response.json()) as MetaApiErrorResponse & { id?: string };
    if (!response.ok || result.error || !result.id) {
      throw new Error(`Meta API error (criar Ad): ${result.error?.message ?? response.statusText}`);
    }
    return { ok: true, adId: result.id };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
