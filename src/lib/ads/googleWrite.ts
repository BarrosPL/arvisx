import type { PlatformCredential } from "./types";
import { exchangeRefreshToken, normalizeCustomerId, GOOGLE_ADS_API_VERSION } from "./google";

export interface WriteResult {
  ok: boolean;
  raw?: unknown;
  errorMessage?: string;
}

export interface BudgetReadResult {
  amountMicros: number | null;
  resourceName: string | null;
  errorMessage?: string;
}

interface GoogleAdsErrorBody {
  error?: { message?: string };
}

interface GoogleAdsBudgetBatch {
  error?: { message?: string };
  results?: { campaignBudget?: { resourceName?: string; amountMicros?: string } }[];
}

async function authHeaders(credential: PlatformCredential): Promise<Record<string, string>> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN nao configurado");
  }
  if (!credential.refreshToken) {
    throw new Error("Credencial Google Ads sem refresh token");
  }
  const accessToken = await exchangeRefreshToken(credential.refreshToken);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (credential.loginCustomerId) {
    headers["login-customer-id"] = normalizeCustomerId(credential.loginCustomerId);
  }
  return headers;
}

/**
 * Pausa ou ativa um anuncio. Precisa do adGroupId (platformAdSetId nas linhas
 * coletadas) pra montar o resourceName - o Google nao aceita so o ad id.
 */
export async function setGoogleAdStatus(
  credential: PlatformCredential,
  adGroupId: string,
  adId: string,
  status: "ENABLED" | "PAUSED"
): Promise<WriteResult> {
  try {
    const customerId = normalizeCustomerId(credential.externalAccountId);
    const headers = await authHeaders(credential);
    const resourceName = `customers/${customerId}/adGroupAds/${adGroupId}~${adId}`;

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/adGroupAds:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [{ update: { resourceName, status }, updateMask: "status" }],
        }),
      }
    );
    const body = (await response.json()) as GoogleAdsErrorBody;
    if (!response.ok || body.error) {
      throw new Error(`Google Ads API error: ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Pausa ou ativa a CAMPANHA inteira (nao um anuncio especifico dentro dela). Diferente
 * de setGoogleAdStatus, so precisa do campaignId - usada quando o usuario pede pra
 * pausar/ativar "a campanha" em vez de um anuncio especifico; lib/execution/executor.ts
 * decide qual das duas chamar com base em qual id a proposta tem preenchido.
 */
export async function setGoogleCampaignStatus(
  credential: PlatformCredential,
  campaignId: string,
  status: "ENABLED" | "PAUSED"
): Promise<WriteResult> {
  try {
    const customerId = normalizeCustomerId(credential.externalAccountId);
    const headers = await authHeaders(credential);
    const resourceName = `customers/${customerId}/campaigns/${campaignId}`;

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [{ update: { resourceName, status }, updateMask: "status" }],
        }),
      }
    );
    const body = (await response.json()) as GoogleAdsErrorBody;
    if (!response.ok || body.error) {
      throw new Error(`Google Ads API error: ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Pausa ou ativa o GRUPO DE ANUNCIOS inteiro (AdGroup - equivalente ao "conjunto de
 * anuncios" do Meta) - nao um anuncio especifico dentro dele (isso e setGoogleAdStatus),
 * nem a campanha inteira (isso e setGoogleCampaignStatus). Usada quando o usuario pede
 * pra pausar/ativar "o conjunto/grupo" em vez de um anuncio ou da campanha inteira.
 */
export async function setGoogleAdGroupStatus(
  credential: PlatformCredential,
  adGroupId: string,
  status: "ENABLED" | "PAUSED"
): Promise<WriteResult> {
  try {
    const customerId = normalizeCustomerId(credential.externalAccountId);
    const headers = await authHeaders(credential);
    const resourceName = `customers/${customerId}/adGroups/${adGroupId}`;

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/adGroups:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [{ update: { resourceName, status }, updateMask: "status" }],
        }),
      }
    );
    const body = (await response.json()) as GoogleAdsErrorBody;
    if (!response.ok || body.error) {
      throw new Error(`Google Ads API error: ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/** Le o orcamento diario atual da campanha (em micros - 1_000_000 micros = 1 unidade monetaria). */
export async function getGoogleCampaignBudget(
  credential: PlatformCredential,
  campaignId: string
): Promise<BudgetReadResult> {
  try {
    const customerId = normalizeCustomerId(credential.externalAccountId);
    const headers = await authHeaders(credential);
    const query = `
      SELECT campaign_budget.resource_name, campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.id = ${campaignId}
    `;

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
      { method: "POST", headers, body: JSON.stringify({ query }) }
    );

    const body = (await response.json()) as GoogleAdsBudgetBatch[] | GoogleAdsBudgetBatch;
    const batches = Array.isArray(body) ? body : [body];

    if (!response.ok) {
      const firstError = batches.find((batch) => batch.error)?.error;
      throw new Error(`Google Ads API error: ${firstError?.message ?? response.statusText}`);
    }

    const firstResult = batches.flatMap((batch) => batch.results ?? [])[0];
    const resourceName = firstResult?.campaignBudget?.resourceName ?? null;
    const amountMicros = firstResult?.campaignBudget?.amountMicros
      ? Number(firstResult.campaignBudget.amountMicros)
      : null;

    return { amountMicros, resourceName };
  } catch (error) {
    return { amountMicros: null, resourceName: null, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/** Define o orcamento diario novo da campanha, em micros. */
export async function setGoogleCampaignBudget(
  credential: PlatformCredential,
  budgetResourceName: string,
  amountMicros: number
): Promise<WriteResult> {
  try {
    const customerId = normalizeCustomerId(credential.externalAccountId);
    const headers = await authHeaders(credential);

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/campaignBudgets:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            { update: { resourceName: budgetResourceName, amountMicros: Math.round(amountMicros) }, updateMask: "amount_micros" },
          ],
        }),
      }
    );
    const body = (await response.json()) as GoogleAdsErrorBody;
    if (!response.ok || body.error) {
      throw new Error(`Google Ads API error: ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

// ---------------------------------------------------------------------------
// Criacao de campanha nova do zero (NEW_CAMPAIGN) - so campanha de Busca (Search),
// keywords + Responsive Search Ad, sem imagem (diferente do Meta). So chamadas por
// lib/execution/executor.ts, na ordem: createGoogleCampaignBudget -> createGoogleCampaign
// -> createGoogleAdGroup -> createGoogleKeywords -> createGoogleResponsiveSearchAd.
// Sem Pixel/Conversions API configurado em lugar nenhum do sistema, a campanha usa
// "Maximizar cliques" (mesmo motivo do Meta usar OUTCOME_TRAFFIC/LINK_CLICKS) - nao ha
// como otimizar por conversao/lead direito ainda.
// ---------------------------------------------------------------------------

interface GoogleMutateResponse {
  error?: { message?: string };
  results?: { resourceName?: string }[];
}

/** Ultimo segmento do resourceName (ex: "customers/123/campaigns/456" -> "456"). Pra
 * criterios/anuncios (ad_group_id~id), pega so a parte depois do "~". */
function lastResourceSegment(resourceName: string): string {
  const last = resourceName.split("/").pop() ?? resourceName;
  return last.includes("~") ? last.split("~")[1] : last;
}

async function mutateOne(
  credential: PlatformCredential,
  resource: string,
  operation: Record<string, unknown>
): Promise<{ ok: boolean; resourceName?: string; errorMessage?: string; raw?: unknown }> {
  try {
    const customerId = normalizeCustomerId(credential.externalAccountId);
    const headers = await authHeaders(credential);
    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/${resource}:mutate`,
      { method: "POST", headers, body: JSON.stringify({ operations: [operation] }) }
    );
    const body = (await response.json()) as GoogleMutateResponse;
    if (!response.ok || body.error) {
      throw new Error(`Google Ads API error (${resource}): ${body.error?.message ?? response.statusText}`);
    }
    const resourceName = body.results?.[0]?.resourceName;
    if (!resourceName) {
      throw new Error(`Google Ads API nao devolveu resourceName pra ${resource}`);
    }
    return { ok: true, resourceName, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface CreateGoogleBudgetResult {
  ok: boolean;
  resourceName?: string;
  errorMessage?: string;
}

/** Cria o orcamento (recurso separado da campanha no Google, diferente do Meta). */
export async function createGoogleCampaignBudget(
  credential: PlatformCredential,
  params: { name: string; dailyBudgetMicros: number }
): Promise<CreateGoogleBudgetResult> {
  const result = await mutateOne(credential, "campaignBudgets", {
    create: { name: params.name, amountMicros: Math.round(params.dailyBudgetMicros) },
  });
  return { ok: result.ok, resourceName: result.resourceName, errorMessage: result.errorMessage };
}

export interface CreateGoogleCampaignResult {
  ok: boolean;
  resourceName?: string;
  campaignId?: string;
  errorMessage?: string;
}

/** Cria a Campanha de Busca em si, ja ENABLED - a aprovacao humana ja aconteceu antes
 * do Executar chamar isto, igual todo o resto do sistema. */
export async function createGoogleCampaign(
  credential: PlatformCredential,
  params: { name: string; budgetResourceName: string; status?: "ENABLED" | "PAUSED" }
): Promise<CreateGoogleCampaignResult> {
  const result = await mutateOne(credential, "campaigns", {
    create: {
      name: params.name,
      status: params.status ?? "ENABLED",
      advertisingChannelType: "SEARCH",
      campaignBudget: params.budgetResourceName,
      maximizeClicks: {},
      networkSettings: {
        targetGoogleSearch: true,
        targetSearchNetwork: true,
        targetContentNetwork: false,
        targetPartnerSearchNetwork: false,
      },
    },
  });
  return {
    ok: result.ok,
    resourceName: result.resourceName,
    campaignId: result.resourceName ? lastResourceSegment(result.resourceName) : undefined,
    errorMessage: result.errorMessage,
  };
}

export interface CreateGoogleAdGroupResult {
  ok: boolean;
  resourceName?: string;
  adGroupId?: string;
  errorMessage?: string;
}

/** Cria o Grupo de anuncios dentro da campanha ja criada. */
export async function createGoogleAdGroup(
  credential: PlatformCredential,
  params: { campaignResourceName: string; name: string; status?: "ENABLED" | "PAUSED" }
): Promise<CreateGoogleAdGroupResult> {
  const result = await mutateOne(credential, "adGroups", {
    create: {
      name: params.name,
      campaign: params.campaignResourceName,
      status: params.status ?? "ENABLED",
      type: "SEARCH_STANDARD",
    },
  });
  return {
    ok: result.ok,
    resourceName: result.resourceName,
    adGroupId: result.resourceName ? lastResourceSegment(result.resourceName) : undefined,
    errorMessage: result.errorMessage,
  };
}

export interface CreateGoogleKeywordsResult {
  ok: boolean;
  errorMessage?: string;
}

/** Cria as palavras-chave (uma operacao por keyword, batch numa unica chamada). */
export async function createGoogleKeywords(
  credential: PlatformCredential,
  params: { adGroupResourceName: string; keywords: { text: string; matchType: "BROAD" | "PHRASE" | "EXACT" }[] }
): Promise<CreateGoogleKeywordsResult> {
  try {
    const customerId = normalizeCustomerId(credential.externalAccountId);
    const headers = await authHeaders(credential);
    const operations = params.keywords.map((keyword) => ({
      create: {
        adGroup: params.adGroupResourceName,
        status: "ENABLED",
        keyword: { text: keyword.text, matchType: keyword.matchType },
      },
    }));

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/adGroupCriteria:mutate`,
      { method: "POST", headers, body: JSON.stringify({ operations }) }
    );
    const body = (await response.json()) as GoogleMutateResponse;
    if (!response.ok || body.error) {
      throw new Error(`Google Ads API error (adGroupCriteria): ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface CreateGoogleResponsiveSearchAdResult {
  ok: boolean;
  adId?: string;
  errorMessage?: string;
}

/** Cria o anuncio (Responsive Search Ad - so texto, sem imagem, diferente do Meta). */
export async function createGoogleResponsiveSearchAd(
  credential: PlatformCredential,
  params: {
    adGroupResourceName: string;
    headlines: string[];
    descriptions: string[];
    finalUrl: string;
    status?: "ENABLED" | "PAUSED";
  }
): Promise<CreateGoogleResponsiveSearchAdResult> {
  const result = await mutateOne(credential, "adGroupAds", {
    create: {
      adGroup: params.adGroupResourceName,
      status: params.status ?? "ENABLED",
      ad: {
        finalUrls: [params.finalUrl],
        responsiveSearchAd: {
          headlines: params.headlines.map((text) => ({ text })),
          descriptions: params.descriptions.map((text) => ({ text })),
        },
      },
    },
  });
  return {
    ok: result.ok,
    adId: result.resourceName ? lastResourceSegment(result.resourceName) : undefined,
    errorMessage: result.errorMessage,
  };
}
