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

// ---------------------------------------------------------------------------
// NEW_CAMPAIGN placeholder note:
// ---------------------------------------------------------------------------

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
