import { CollectionState } from "@/generated/prisma/client";
import type { CollectionResult, NormalizedAdRow, PlatformCredential } from "./types";
import { classifyCollectionError, classifyRows } from "./collectionState";

export const GOOGLE_ADS_API_VERSION = "v25";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeRefreshToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET nao configurados");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || body.error) {
    throw new Error(`Google OAuth error: ${body.error ?? response.statusText} - ${body.error_description ?? ""}`);
  }
  if (!body.access_token) {
    throw new Error("Google OAuth error: resposta sem access_token");
  }
  return body.access_token;
}

export function normalizeCustomerId(externalAccountId: string): string {
  return externalAccountId.replace(/-/g, "");
}

interface GoogleAdsMetricsRow {
  campaign?: { id?: string; name?: string };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { ad?: { id?: string; name?: string }; status?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    ctr?: number;
    averageCpc?: string;
    averageCpm?: string;
    conversions?: number;
  };
}

interface GoogleAdsStreamBatch {
  results?: GoogleAdsMetricsRow[];
  error?: { message?: string; details?: unknown };
}

const GAQL_QUERY = `
  SELECT
    campaign.id,
    campaign.name,
    ad_group.id,
    ad_group.name,
    ad_group_ad.ad.id,
    ad_group_ad.ad.name,
    ad_group_ad.status,
    metrics.cost_micros,
    metrics.impressions,
    metrics.clicks,
    metrics.ctr,
    metrics.average_cpc,
    metrics.average_cpm,
    metrics.conversions
  FROM ad_group_ad
  WHERE segments.date DURING LAST_7_DAYS
`;

function normalizeRow(row: GoogleAdsMetricsRow): NormalizedAdRow {
  const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
  const conversions = Number(row.metrics?.conversions ?? 0);
  return {
    platformCampaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    platformAdId: row.adGroupAd?.ad?.id ?? null,
    adName: row.adGroupAd?.ad?.name ?? null,
    platformAdSetId: row.adGroup?.id ?? null,
    adSetName: row.adGroup?.name ?? null,
    spend,
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    ctr: Number(row.metrics?.ctr ?? 0) * 100,
    cpc: Number(row.metrics?.averageCpc ?? 0) / 1_000_000,
    conversions,
    cpl: conversions > 0 ? spend / conversions : null,
    cpa: conversions > 0 ? spend / conversions : null,
    // Alcance/frequencia nao sao metricas padrao por anuncio no Google Ads para a
    // maioria dos tipos de campanha - fica null, nunca inventado.
    reach: null,
    frequency: null,
    cpm: row.metrics?.averageCpm !== undefined ? Number(row.metrics.averageCpm) / 1_000_000 : null,
    adStatus: row.adGroupAd?.status ?? null,
    raw: row,
  };
}

export async function fetchGoogleAdsInsights(credential: PlatformCredential): Promise<CollectionResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      state: CollectionState.API_ERROR,
      rows: [],
      errorMessage: "GOOGLE_ADS_DEVELOPER_TOKEN nao configurado",
    };
  }
  if (!credential.refreshToken) {
    return {
      state: CollectionState.AUTH_ERROR,
      rows: [],
      errorMessage: "Credencial Google Ads sem refresh token",
    };
  }

  try {
    const accessToken = await exchangeRefreshToken(credential.refreshToken);
    const customerId = normalizeCustomerId(credential.externalAccountId);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (credential.loginCustomerId) {
      headers["login-customer-id"] = normalizeCustomerId(credential.loginCustomerId);
    }

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query: GAQL_QUERY }),
      }
    );

    const body = (await response.json()) as GoogleAdsStreamBatch[] | GoogleAdsStreamBatch;
    const batches = Array.isArray(body) ? body : [body];

    if (!response.ok) {
      const firstError = batches.find((batch) => batch.error)?.error;
      throw new Error(`Google Ads API error: ${firstError?.message ?? response.statusText}`);
    }

    const rows: NormalizedAdRow[] = [];
    for (const batch of batches) {
      for (const row of batch.results ?? []) {
        rows.push(normalizeRow(row));
      }
    }

    return { state: classifyRows(rows.length), rows };
  } catch (error) {
    const { state, message } = classifyCollectionError(error);
    return { state, rows: [], errorMessage: message };
  }
}

export async function probeGoogleAdsCredential(
  credential: PlatformCredential
): Promise<{ ok: boolean; message?: string }> {
  const result = await fetchGoogleAdsInsights(credential);
  if (result.state === CollectionState.AUTH_ERROR || result.state === CollectionState.API_ERROR) {
    return { ok: false, message: result.errorMessage };
  }
  return { ok: true };
}
