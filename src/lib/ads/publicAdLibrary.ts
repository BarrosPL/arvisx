import type { PlatformCredential } from "./types";

const GRAPH_API_VERSION = "v21.0";

export interface PublicAdLibraryItem {
  id: string;
  pageName: string | null;
  bodyText: string | null;
  deliveryStartDate: string | null;
  /** Link pra ver o anuncio original renderizado (imagem/video) - a API nao devolve
   * uma image_url direta pra anuncio comum, so esse link. */
  snapshotUrl: string | null;
}

export interface PublicAdLibrarySearchResult {
  items: PublicAdLibraryItem[];
  errorMessage?: string;
}

interface AdsArchiveRow {
  id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_delivery_start_time?: string;
  ad_snapshot_url?: string;
}

interface AdsArchiveResponse {
  data?: AdsArchiveRow[];
  error?: { message?: string };
}

/**
 * Biblioteca de anuncios PUBLICA da Meta (concorrencia/mercado) - endpoint /ads_archive,
 * diferente de tudo mais em lib/ads/*.ts (que le a PROPRIA conta do Renan). Usa
 * qualquer token de usuario Meta ja conectado (nao precisa ser dono da conta anunciante
 * - e dado publico). Verificado ao vivo: anuncio comercial comum (nao-politico)
 * aparece pra qualquer pais (ex: Brasil) sem precisar de alcance na UE - a doc oficial
 * da Meta sugere o contrario mas nao reflete o comportamento real testado. spend/
 * impressions/estimated_audience_size so existem pra anuncio politico/de interesse
 * social - por isso nem pedimos esses campos aqui.
 */
export async function searchPublicAdLibrary(
  credential: PlatformCredential,
  params: { query: string; countries?: string[]; limit?: number }
): Promise<PublicAdLibrarySearchResult> {
  const countries = params.countries && params.countries.length > 0 ? params.countries : ["BR"];
  const limit = params.limit ?? 10;

  const searchParams = new URLSearchParams({
    search_terms: params.query,
    ad_reached_countries: JSON.stringify(countries),
    ad_type: "ALL",
    ad_active_status: "ALL",
    fields: "id,page_name,ad_creative_bodies,ad_delivery_start_time,ad_snapshot_url",
    limit: String(limit),
    access_token: credential.accessToken,
  });

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/ads_archive?${searchParams.toString()}`);
    const body = (await response.json()) as AdsArchiveResponse;

    if (!response.ok || body.error) {
      throw new Error(`Meta Ad Library API error: ${body.error?.message ?? response.statusText}`);
    }

    const items: PublicAdLibraryItem[] = (body.data ?? [])
      .filter((row) => row.id)
      .map((row) => ({
        id: row.id!,
        pageName: row.page_name ?? null,
        bodyText: row.ad_creative_bodies?.[0] ?? null,
        deliveryStartDate: row.ad_delivery_start_time ?? null,
        snapshotUrl: row.ad_snapshot_url ?? null,
      }));

    return { items };
  } catch (error) {
    return { items: [], errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
