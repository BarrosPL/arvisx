import type { LibraryCollectionResult, NormalizedAdCreativeRow, PlatformCredential } from "./types";
import { classifyCollectionError, classifyRows } from "./collectionState";
import { GOOGLE_ADS_API_VERSION, exchangeRefreshToken, normalizeCustomerId } from "./google";
import { CollectionState } from "@/generated/prisma/client";

interface GoogleAdLibraryRow {
  campaign?: { id?: string; name?: string };
  adGroupAd?: {
    status?: string;
    ad?: {
      id?: string;
      name?: string;
      responsiveSearchAd?: { headlines?: { text?: string }[]; descriptions?: { text?: string }[] };
      imageAd?: { imageUrl?: string };
    };
  };
}

interface GoogleAdLibraryBatch {
  results?: GoogleAdLibraryRow[];
  error?: { message?: string };
}

const GAQL_QUERY = `
  SELECT
    campaign.id,
    campaign.name,
    ad_group_ad.status,
    ad_group_ad.ad.id,
    ad_group_ad.ad.name,
    ad_group_ad.ad.responsive_search_ad.headlines,
    ad_group_ad.ad.responsive_search_ad.descriptions,
    ad_group_ad.ad.image_ad.image_url
  FROM ad_group_ad
  WHERE ad_group_ad.status != 'REMOVED'
`;

function normalizeRow(row: GoogleAdLibraryRow): NormalizedAdCreativeRow | null {
  const adId = row.adGroupAd?.ad?.id;
  if (!adId) return null;
  const rsa = row.adGroupAd?.ad?.responsiveSearchAd;
  return {
    platformAdId: adId,
    platformCampaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    adName: row.adGroupAd?.ad?.name ?? null,
    status: row.adGroupAd?.status ?? null,
    // Tipos como Performance Max nao tem esses campos - fica null, nunca inventado.
    headline: rsa?.headlines?.[0]?.text ?? null,
    bodyText: rsa?.descriptions?.[0]?.text ?? null,
    thumbnailUrl: row.adGroupAd?.ad?.imageAd?.imageUrl ?? null,
    callToAction: null, // Google Ads nao expoe um call-to-action generico equivalente ao da Meta
    raw: row,
  };
}

/**
 * Biblioteca de criativos de verdade - lista ad_group_ad sem filtro de data (so exclui
 * REMOVED), entao cobre anuncio pausado tambem, e traz headline/descricao/imagem
 * quando o tipo de anuncio expoe esses campos (RSA, imagem) - Performance Max e outros
 * tipos sem campo equivalente ficam com esses campos null.
 */
export async function fetchGoogleAdLibrary(credential: PlatformCredential): Promise<LibraryCollectionResult> {
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

    const body = (await response.json()) as GoogleAdLibraryBatch[] | GoogleAdLibraryBatch;
    const batches = Array.isArray(body) ? body : [body];

    if (!response.ok) {
      const firstError = batches.find((batch) => batch.error)?.error;
      throw new Error(`Google Ads API error: ${firstError?.message ?? response.statusText}`);
    }

    const rows: NormalizedAdCreativeRow[] = [];
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
