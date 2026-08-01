import { prisma } from "@/lib/prisma";
import { toPlatformCredential } from "./credentials";
import { CollectionState, CredentialStatus, type Platform, type Prisma } from "@/generated/prisma/client";
import type { CollectionResult, PlatformCredential } from "./types";

export interface CollectSummary {
  credentialId: string;
  externalAccountId: string;
  state: CollectionState;
  rowCount: number;
  errorMessage?: string;
}

function credentialStatusFor(state: CollectionState): CredentialStatus {
  if (state === CollectionState.AUTH_ERROR) return CredentialStatus.AUTH_ERROR;
  return CredentialStatus.CONNECTED;
}

/** Coleta metricas por ANUNCIO de UMA conta. Antes recebia um brandId e varria todas as
 * contas da marca - com a remocao do conceito de marca, a conta e a unidade. */
export async function collectAdMetricsForAccount(
  credentialId: string,
  platform: Platform,
  fetcher: (credential: PlatformCredential) => Promise<CollectionResult>
): Promise<CollectSummary[]> {
  const credentials = await prisma.adCredential.findMany({
    where: { id: credentialId, platform },
    include: { providerConnection: true },
  });
  const summaries: CollectSummary[] = [];

  const dateRangeEnd = new Date();
  const dateRangeStart = new Date(dateRangeEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const record of credentials) {
    const platformCredential = toPlatformCredential(record);
    const result = await fetcher(platformCredential);

    const rowsToInsert: Prisma.AdMetricSnapshotCreateManyInput[] =
      result.rows.length > 0
        ? result.rows.map((row) => ({
            credentialId: record.id,
            platform,
            platformCampaignId: row.platformCampaignId,
            campaignName: row.campaignName,
            platformAdId: row.platformAdId,
            adName: row.adName,
            platformAdSetId: row.platformAdSetId,
            adSetName: row.adSetName,
            collectionState: CollectionState.OK,
            dateRangeStart,
            dateRangeEnd,
            spend: row.spend,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            cpc: row.cpc,
            conversions: row.conversions,
            cpl: row.cpl,
            cpa: row.cpa,
            reach: row.reach,
            frequency: row.frequency,
            cpm: row.cpm,
            adStatus: row.adStatus,
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

    // Nao apaga snapshots anteriores - AdMetricSnapshot acumula historico real ao
    // longo do tempo (computeAndSaveRanking so le a coleta mais recente por anuncio).
    await prisma.$transaction([
      prisma.adMetricSnapshot.createMany({ data: rowsToInsert }),
      prisma.adCredential.update({
        where: { id: record.id },
        data: {
          status: credentialStatusFor(result.state),
          lastCheckedAt: new Date(),
          lastError: result.errorMessage ?? null,
        },
      }),
    ]);

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
