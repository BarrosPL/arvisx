import type { CollectionResult, NormalizedAdRow, PlatformCredential } from "./types";
import { classifyCollectionError, classifyRows } from "./collectionState";
import { recordMetaThrottle } from "./metaThrottle";

const GRAPH_API_VERSION = "v21.0";
const MAX_PAGES = 10;

const CONVERSION_ACTION_TYPES = new Set([
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.lead_grouped",
]);

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  actions?: MetaAction[];
}

interface MetaApiResponse {
  data?: MetaInsightRow[];
  paging?: { next?: string };
  error?: { message: string; type?: string; code?: number; error_subcode?: number };
}

function countConversions(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;
  return actions
    .filter((action) => CONVERSION_ACTION_TYPES.has(action.action_type))
    .reduce((sum, action) => sum + Number(action.value || 0), 0);
}

function normalizeRow(row: MetaInsightRow): NormalizedAdRow {
  const spend = Number(row.spend || 0);
  const conversions = countConversions(row.actions);
  return {
    platformCampaignId: row.campaign_id ?? null,
    campaignName: row.campaign_name ?? null,
    platformAdId: row.ad_id ?? null,
    adName: row.ad_name ?? null,
    platformAdSetId: row.adset_id ?? null,
    adSetName: row.adset_name ?? null,
    spend,
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    ctr: Number(row.ctr || 0),
    cpc: Number(row.cpc || 0),
    conversions,
    cpl: conversions > 0 ? spend / conversions : null,
    cpa: conversions > 0 ? spend / conversions : null,
    reach: row.reach !== undefined ? Number(row.reach) : null,
    frequency: row.frequency !== undefined ? Number(row.frequency) : null,
    cpm: row.cpm !== undefined ? Number(row.cpm) : null,
    adStatus: null, // preenchido depois via fetchMetaAdStatuses
    raw: row,
  };
}

interface MetaAdStatusRow {
  id?: string;
  effective_status?: string;
}

interface MetaAdStatusResponse {
  data?: MetaAdStatusRow[];
  paging?: { next?: string };
  error?: { message: string };
}

/**
 * O endpoint de Insights nao expoe status de veiculacao do anuncio - so a edge
 * /ads do proprio no traz effective_status. Chamada separada, best-effort: se
 * falhar, a coleta de metricas (que ja rodou) continua valendo, so o status fica
 * null nessas linhas.
 */
async function fetchMetaAdStatuses(credential: PlatformCredential): Promise<Map<string, string>> {
  const accountId = credential.externalAccountId.startsWith("act_")
    ? credential.externalAccountId
    : `act_${credential.externalAccountId}`;

  const statusByAdId = new Map<string, string>();
  let url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/ads` +
    `?fields=id,effective_status&limit=500&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    for (let page = 0; page < MAX_PAGES && url; page += 1) {
      const response = await fetch(url);
      const body = (await response.json()) as MetaAdStatusResponse;
      if (!response.ok || body.error) {
        throw new Error(body.error?.message ?? response.statusText);
      }
      for (const row of body.data ?? []) {
        if (row.id && row.effective_status) statusByAdId.set(row.id, row.effective_status);
      }
      url = body.paging?.next ?? "";
    }
  } catch {
    // best-effort - ver comentario acima
  }

  return statusByAdId;
}

export async function fetchMetaInsights(
  credential: PlatformCredential,
  opts: { datePreset?: string } = {}
): Promise<CollectionResult> {
  const datePreset = opts.datePreset ?? "last_7d";
  const accountId = credential.externalAccountId.startsWith("act_")
    ? credential.externalAccountId
    : `act_${credential.externalAccountId}`;

  const fields = [
    "campaign_id",
    "campaign_name",
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "cpc",
    "reach",
    "frequency",
    "cpm",
    "actions",
  ].join(",");

  let url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/insights` +
    `?level=ad&limit=500&date_preset=${datePreset}&fields=${fields}&access_token=${encodeURIComponent(
      credential.accessToken
    )}`;

  const rows: NormalizedAdRow[] = [];

  try {
    for (let page = 0; page < MAX_PAGES && url; page += 1) {
      const response = await fetch(url);
      // Registra a cota consumida antes de tratar erro - o cabecalho vem junto mesmo
      // na resposta de falha, e e ai que ele mais importa.
      recordMetaThrottle(response, accountId);
      const body = (await response.json()) as MetaApiResponse;

      if (!response.ok || body.error) {
        const code = body.error?.code;
        const subcode = body.error?.error_subcode;
        throw new Error(
          `Meta API error: ${body.error?.message ?? response.statusText} (code=${code}, subcode=${subcode})`
        );
      }

      for (const row of body.data ?? []) {
        rows.push(normalizeRow(row));
      }

      url = body.paging?.next ?? "";
    }

    const statusByAdId = await fetchMetaAdStatuses(credential);
    for (const row of rows) {
      if (row.platformAdId) row.adStatus = statusByAdId.get(row.platformAdId) ?? null;
    }

    return { state: classifyRows(rows.length), rows };
  } catch (error) {
    const { state, message } = classifyCollectionError(error);
    return { state, rows: [], errorMessage: message };
  }
}

