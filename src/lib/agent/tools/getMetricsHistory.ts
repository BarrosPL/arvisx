import { prisma } from "@/lib/prisma";
import type { GetMetricsHistoryArgs } from "@/lib/agent/schema";

/**
 * Historico real de coletas de um anuncio especifico, em ordem cronologica - usa as
 * linhas que antes eram apagadas a cada coleta (lib/ads/collect.ts nao apaga mais
 * AdMetricSnapshot). Deixa a JAMILE comparar performance ao longo do tempo, nao so
 * o instantaneo mais recente.
 */
export async function getMetricsHistory(credentialId: string, args: GetMetricsHistoryArgs) {
  const snapshots = await prisma.adMetricSnapshot.findMany({
    where: { credentialId, platformAdId: args.platformAdId, collectionState: "OK" },
    orderBy: { collectedAt: "asc" },
    take: args.limit,
  });

  return {
    count: snapshots.length,
    history: snapshots.map((snapshot) => ({
      collectedAt: snapshot.collectedAt.toISOString(),
      spend: Number(snapshot.spend),
      ctr: Number(snapshot.ctr),
      cpc: Number(snapshot.cpc),
      conversions: snapshot.conversions,
      cpl: snapshot.cpl !== null ? Number(snapshot.cpl) : null,
      cpa: snapshot.cpa !== null ? Number(snapshot.cpa) : null,
    })),
  };
}
