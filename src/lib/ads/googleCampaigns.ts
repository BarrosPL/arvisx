import type { CampaignCollectionResult, NormalizedCampaignRow, PlatformCredential } from "./types";
import { classifyCollectionError, classifyRows } from "./collectionState";
import { GOOGLE_ADS_API_VERSION, exchangeRefreshToken, normalizeCustomerId } from "./google";
import { CollectionState } from "@/generated/prisma/client";

interface GoogleCampaignRow {
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
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

interface GoogleCampaignBatch {
  results?: GoogleCampaignRow[];
  error?: { message?: string };
}

/** Diferente do Meta, o Google entrega tudo numa consulta so - status da campanha e
 * metrica saem juntos de FROM campaign. Nao ha equivalente de "objetivo que define o
 * resultado": no Google, resultado E `metrics.conversions`, ja de acordo com as acoes
 * de conversao configuradas na conta. */
const GAQL_QUERY = `
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    metrics.cost_micros,
    metrics.impressions,
    metrics.clicks,
    metrics.ctr,
    metrics.average_cpc,
    metrics.average_cpm,
    metrics.conversions
  FROM campaign
  WHERE segments.date DURING LAST_7_DAYS
`;

function normalizeRow(row: GoogleCampaignRow): NormalizedCampaignRow | null {
  const campaignId = row.campaign?.id;
  if (!campaignId) return null;

  const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
  // conversions vem fracionario no Google (atribuicao parcial, ex: 3.5) - arredonda
  // so na exibicao/gravacao, nunca truncando pra baixo silenciosamente.
  const results = Math.round(Number(row.metrics?.conversions ?? 0));

  return {
    platformCampaignId: campaignId,
    campaignName: row.campaign?.name ?? null,
    campaignStatus: row.campaign?.status ?? null,
    objective: row.campaign?.advertisingChannelType ?? null,
    spend,
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    ctr: Number(row.metrics?.ctr ?? 0) * 100,
    cpc: Number(row.metrics?.averageCpc ?? 0) / 1_000_000,
    results,
    resultType: results > 0 ? "conversions" : null,
    cpr: results > 0 ? spend / results : null,
    // Alcance/frequencia nao sao metricas padrao de campanha no Google Ads pra maioria
    // dos tipos - fica null, nunca inventado (mesma decisao ja tomada em google.ts).
    reach: null,
    frequency: null,
    cpm: row.metrics?.averageCpm !== undefined ? Number(row.metrics.averageCpm) / 1_000_000 : null,
    raw: row,
  };
}

/** Espelha fetchMetaCampaignInsights pro Google Ads - metricas no nivel de campanha. */
export async function fetchGoogleCampaignInsights(
  credential: PlatformCredential
): Promise<CampaignCollectionResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return { state: CollectionState.API_ERROR, rows: [], errorMessage: "GOOGLE_ADS_DEVELOPER_TOKEN nao configurado" };
  }
  if (!credential.refreshToken) {
    return { state: CollectionState.AUTH_ERROR, rows: [], errorMessage: "Credencial Google Ads sem refresh token" };
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
      { method: "POST", headers, body: JSON.stringify({ query: GAQL_QUERY }) }
    );

    const body = (await response.json()) as GoogleCampaignBatch[] | GoogleCampaignBatch;
    const batches = Array.isArray(body) ? body : [body];

    if (!response.ok) {
      const firstError = batches.find((batch) => batch.error)?.error;
      throw new Error(`Google Ads API error: ${firstError?.message ?? response.statusText}`);
    }

    const rows: NormalizedCampaignRow[] = [];
    for (const batch of batches) {
      for (const row of batch.results ?? []) {
        const normalized = normalizeRow(row);
        if (normalized) rows.push(normalized);
      }
    }

    return { state: classifyRows(rows.length), rows };
  } catch (error) {
    const { state, message } = classifyCollectionError(error);
    return { state, rows: [], errorMessage: message };
  }
}
