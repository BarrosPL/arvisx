import { prisma } from "@/lib/prisma";
import { toPlatformCredential } from "./credentials";
import type { Platform, Prisma } from "@/generated/prisma/client";
import type { LibraryCollectionResult, PlatformCredential } from "./types";
import type { CollectSummary } from "./collect";

/**
 * Espelha collectForBrand (lib/ads/collect.ts) mas para a Biblioteca de anuncios:
 * diferente da metrica (que acumula historico), aqui cada sincronizacao so atualiza o
 * estado atual de cada criativo - upsert por (credentialId, platformAdId) em vez de
 * inserir linha nova. Nao mexe em AdCredential.status/lastError de proposito - quem
 * ja e dono desse campo e collectForBrand (metricas), rodado sempre junto; duas
 * funcoes escrevendo no mesmo campo do credential na mesma rodada só criaria corrida
 * entre elas.
 */
export async function collectAdLibraryForBrand(
  brandId: string,
  platform: Platform,
  fetcher: (credential: PlatformCredential) => Promise<LibraryCollectionResult>
): Promise<CollectSummary[]> {
  const credentials = await prisma.adCredential.findMany({
    where: { brandId, platform },
    include: { providerConnection: true },
  });
  const summaries: CollectSummary[] = [];

  for (const record of credentials) {
    const platformCredential = toPlatformCredential(record);
    const result = await fetcher(platformCredential);

    if (result.rows.length > 0) {
      await prisma.$transaction(
        result.rows.map((row) =>
          prisma.adCreative.upsert({
            where: { credentialId_platformAdId: { credentialId: record.id, platformAdId: row.platformAdId } },
            update: {
              brandId,
              platform,
              platformCampaignId: row.platformCampaignId,
              campaignName: row.campaignName,
              adName: row.adName,
              status: row.status,
              headline: row.headline,
              bodyText: row.bodyText,
              thumbnailUrl: row.thumbnailUrl,
              callToAction: row.callToAction,
              raw: (row.raw ?? null) as Prisma.InputJsonValue,
              collectedAt: new Date(),
            },
            create: {
              brandId,
              credentialId: record.id,
              platform,
              platformAdId: row.platformAdId,
              platformCampaignId: row.platformCampaignId,
              campaignName: row.campaignName,
              adName: row.adName,
              status: row.status,
              headline: row.headline,
              bodyText: row.bodyText,
              thumbnailUrl: row.thumbnailUrl,
              callToAction: row.callToAction,
              raw: (row.raw ?? null) as Prisma.InputJsonValue,
            },
          })
        )
      );
    }

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
