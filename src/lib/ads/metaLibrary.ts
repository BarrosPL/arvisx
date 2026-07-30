import type { LibraryCollectionResult, NormalizedAdCreativeRow, PlatformCredential } from "./types";
import { classifyCollectionError, classifyRows } from "./collectionState";

const GRAPH_API_VERSION = "v21.0";
const MAX_PAGES = 10;

interface MetaAdLibraryRow {
  id?: string;
  name?: string;
  status?: string;
  campaign?: { id?: string; name?: string };
  adset?: { id?: string; name?: string };
  creative?: {
    thumbnail_url?: string;
    body?: string;
    title?: string;
    call_to_action_type?: string;
  };
}

interface MetaAdLibraryResponse {
  data?: MetaAdLibraryRow[];
  paging?: { next?: string };
  error?: { message: string; code?: number };
}

function normalizeRow(row: MetaAdLibraryRow): NormalizedAdCreativeRow | null {
  if (!row.id) return null;
  return {
    platformAdId: row.id,
    platformCampaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    adName: row.name ?? null,
    platformAdSetId: row.adset?.id ?? null,
    adSetName: row.adset?.name ?? null,
    status: row.status ?? null,
    headline: row.creative?.title ?? null,
    bodyText: row.creative?.body ?? null,
    thumbnailUrl: row.creative?.thumbnail_url ?? null,
    callToAction: row.creative?.call_to_action_type ?? null,
    raw: row,
  };
}

/**
 * Biblioteca de criativos de verdade - listagem direta de /act_X/ads (nao um relatorio
 * de Insights por data), entao traz anuncio pausado/sem gasto recente tambem, e o
 * conteudo do criativo (imagem/texto) que Insights nunca devolve.
 */
export async function fetchMetaAdLibrary(credential: PlatformCredential): Promise<LibraryCollectionResult> {
  const accountId = credential.externalAccountId.startsWith("act_")
    ? credential.externalAccountId
    : `act_${credential.externalAccountId}`;

  const fields = [
    "id",
    "name",
    "status",
    "campaign{id,name}",
    "adset{id,name}",
    "creative{thumbnail_url,body,title,call_to_action_type}",
  ].join(",");

  let url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/ads` +
    `?limit=500&fields=${fields}&access_token=${encodeURIComponent(credential.accessToken)}`;

  const rows: NormalizedAdCreativeRow[] = [];

  try {
    for (let page = 0; page < MAX_PAGES && url; page += 1) {
      const response = await fetch(url);
      const body = (await response.json()) as MetaAdLibraryResponse;

      if (!response.ok || body.error) {
        throw new Error(`Meta API error: ${body.error?.message ?? response.statusText} (code=${body.error?.code})`);
      }

      for (const row of body.data ?? []) {
        const normalized = normalizeRow(row);
        if (normalized) rows.push(normalized);
      }

      url = body.paging?.next ?? "";
    }

    return { state: classifyRows(rows.length), rows };
  } catch (error) {
    const { state, message } = classifyCollectionError(error);
    return { state, rows: [], errorMessage: message };
  }
}
