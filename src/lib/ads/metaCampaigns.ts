import type { CampaignCollectionResult, NormalizedCampaignRow, PlatformCredential } from "./types";
import { classifyCollectionError, classifyRows } from "./collectionState";
import { resolveResultMetric, type MetaActionEntry } from "./resultMetric";

const GRAPH_API_VERSION = "v21.0";
/** Bem menor que o MAX_PAGES=10 usado na coleta por anuncio: uma conta tem ordens de
 * grandeza menos campanhas que anuncios, e paginar demais foi justamente o que fez a
 * Meta devolver erro de excesso de dados requisitados (code -1). */
const MAX_PAGES = 3;
const PAGE_LIMIT = 200;

interface MetaCampaignRow {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
}

interface MetaCampaignInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  actions?: MetaActionEntry[];
}

interface MetaApiResponse<T> {
  data?: T[];
  paging?: { next?: string };
  error?: { message: string; type?: string; code?: number; error_subcode?: number };
}

function accountId(credential: PlatformCredential): string {
  return credential.externalAccountId.startsWith("act_")
    ? credential.externalAccountId
    : `act_${credential.externalAccountId}`;
}

async function fetchPaged<T>(startUrl: string): Promise<T[]> {
  const rows: T[] = [];
  let url = startUrl;
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const response = await fetch(url);
    const body = (await response.json()) as MetaApiResponse<T>;
    if (!response.ok || body.error) {
      throw new Error(
        `Meta API error: (#${body.error?.code ?? "?"}) ${body.error?.message ?? response.statusText}`
      );
    }
    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? "";
  }
  return rows;
}

/**
 * Coleta metricas no nivel de CAMPANHA no Meta - duas chamadas por conta:
 * 1. /act_X/campaigns  -> estrutura, status real e objetivo (sem filtro de data, entao
 *    campanha ativa sem gasto recente tambem aparece).
 * 2. /act_X/insights?level=campaign -> metricas dos ultimos 7 dias, ja com o alcance
 *    DEDUPLICADO pela propria Meta (o motivo de existir este arquivo em vez de somar as
 *    linhas de anuncio, que contaria a mesma pessoa varias vezes).
 * O objetivo vindo da chamada 1 e o que decide qual acao conta como "Resultado" na
 * chamada 2, pra bater com a coluna do Gerenciador de Anuncios.
 */
export async function fetchMetaCampaignInsights(
  credential: PlatformCredential,
  opts?: { datePreset?: string }
): Promise<CampaignCollectionResult> {
  const datePreset = opts?.datePreset ?? "last_7d";
  const account = accountId(credential);
  const token = encodeURIComponent(credential.accessToken);

  try {
    const campaigns = await fetchPaged<MetaCampaignRow>(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${account}/campaigns` +
        `?limit=${PAGE_LIMIT}&fields=id,name,status,effective_status,objective&access_token=${token}`
    );

    const insightFields = [
      "campaign_id",
      "campaign_name",
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

    const insights = await fetchPaged<MetaCampaignInsightRow>(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${account}/insights` +
        `?level=campaign&limit=${PAGE_LIMIT}&date_preset=${datePreset}&fields=${insightFields}&access_token=${token}`
    );

    const insightsByCampaign = new Map<string, MetaCampaignInsightRow>();
    for (const row of insights) {
      if (row.campaign_id) insightsByCampaign.set(row.campaign_id, row);
    }

    const rows: NormalizedCampaignRow[] = [];
    for (const campaign of campaigns) {
      if (!campaign.id) continue;
      const insight = insightsByCampaign.get(campaign.id);
      const spend = Number(insight?.spend || 0);
      const result = resolveResultMetric(insight?.actions, campaign.objective);

      rows.push({
        platformCampaignId: campaign.id,
        campaignName: campaign.name ?? insight?.campaign_name ?? null,
        // effective_status reflete tambem pausa herdada da conta/limite de gasto -
        // e o que o Gerenciador mostra como estado real de veiculacao.
        campaignStatus: campaign.effective_status ?? campaign.status ?? null,
        objective: campaign.objective ?? null,
        spend,
        impressions: Number(insight?.impressions || 0),
        clicks: Number(insight?.clicks || 0),
        ctr: Number(insight?.ctr || 0),
        cpc: Number(insight?.cpc || 0),
        results: result.value,
        resultType: result.resultType,
        cpr: result.value > 0 ? spend / result.value : null,
        reach: insight?.reach !== undefined ? Number(insight.reach) : null,
        frequency: insight?.frequency !== undefined ? Number(insight.frequency) : null,
        cpm: insight?.cpm !== undefined ? Number(insight.cpm) : null,
        raw: { campaign, insight },
      });
    }

    return { state: classifyRows(rows.length), rows };
  } catch (error) {
    const { state, message } = classifyCollectionError(error);
    return { state, rows: [], errorMessage: message };
  }
}
