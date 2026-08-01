import { prisma } from "@/lib/prisma";
import { toPlatformCredential } from "./credentials";
import { CollectionState, type Platform, type Prisma } from "@/generated/prisma/client";
import type { CampaignCollectionResult, PlatformCredential } from "./types";
import type { CollectSummary } from "./collect";
import { fetchMetaCampaignInsights } from "./metaCampaigns";
import { fetchGoogleCampaignInsights } from "./googleCampaigns";

/**
 * Espelha collectAdMetricsForAccount (lib/ads/collect.ts) mas no nivel de CAMPANHA. Assim como
 * collectAdLibraryForAccount, NAO mexe em AdCredential.status/lastError de proposito -
 * quem e dono desse campo e collectAdMetricsForAccount (metricas por anuncio); duas funcoes
 * escrevendo no mesmo campo na mesma janela so criaria corrida entre elas.
 *
 * Acumula historico (nunca apaga), igual AdMetricSnapshot - quem le pega so a coleta
 * mais recente por (credentialId, platformCampaignId).
 */
export async function collectCampaignsForAccount(
  credentialId: string,
  platform: Platform,
  fetcher: (credential: PlatformCredential) => Promise<CampaignCollectionResult>
): Promise<CollectSummary[]> {
  const credentials = await prisma.adCredential.findMany({
    where: { id: credentialId, platform },
    include: { providerConnection: true },
  });
  const summaries: CollectSummary[] = [];

  const dateRangeEnd = new Date();
  const dateRangeStart = new Date(dateRangeEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const record of credentials) {
    let result: CampaignCollectionResult;
    try {
      result = await fetcher(toPlatformCredential(record));
    } catch (error) {
      // toPlatformCredential (decryptSecret) pode lancar de forma sincrona - sem este
      // catch, uma credencial com token ilegivel derrubaria a coleta inteira.
      result = {
        state: CollectionState.API_ERROR,
        rows: [],
        errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
      };
    }

    const rowsToInsert: Prisma.CampaignMetricSnapshotCreateManyInput[] =
      result.rows.length > 0
        ? result.rows.map((row) => ({
            credentialId: record.id,
            platform,
            platformCampaignId: row.platformCampaignId,
            campaignName: row.campaignName,
            campaignStatus: row.campaignStatus,
            objective: row.objective,
            collectionState: CollectionState.OK,
            dateRangeStart,
            dateRangeEnd,
            spend: row.spend,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            cpc: row.cpc,
            results: row.results,
            resultType: row.resultType,
            cpr: row.cpr,
            reach: row.reach,
            frequency: row.frequency,
            cpm: row.cpm,
            raw: (row.raw ?? null) as Prisma.InputJsonValue,
          }))
        : [
            {
              credentialId: record.id,
              platform,
              collectionState: result.state,
              dateRangeStart,
              dateRangeEnd,
              errorMessage: result.errorMessage,
            },
          ];

    await prisma.campaignMetricSnapshot.createMany({ data: rowsToInsert });

    summaries.push({
      credentialId: record.id,
      externalAccountId: record.externalAccountId,
      state: result.state,
      rowCount: result.rows.length,
      errorMessage: result.errorMessage,
    });
  }

  return summaries;
}

/** Coleta de campanha de UMA conta - o que o ciclo rapido do scheduler (a cada 15min)
 * chama. Tenta as duas plataformas porque a conta so casa com uma delas (o filtro por
 * platform dentro de collectCampaignsForAccount descarta a outra), e assim quem chama
 * nao precisa saber de qual plataforma a conta e. */
export async function collectAllCampaignsForAccount(credentialId: string): Promise<CollectSummary[]> {
  const summaries: CollectSummary[] = [];
  for (const [platform, fetcher] of [
    ["META", fetchMetaCampaignInsights],
    ["GOOGLE", fetchGoogleCampaignInsights],
  ] as const) {
    try {
      summaries.push(...(await collectCampaignsForAccount(credentialId, platform, fetcher)));
    } catch {
      // Best-effort por plataforma - ja e registrado por credencial dentro da funcao.
    }
  }
  return summaries;
}
