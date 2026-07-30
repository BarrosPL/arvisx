import { prisma } from "@/lib/prisma";
import type { GetMetricsArgs } from "@/lib/agent/schema";
import { classifyFunnelStage } from "@/lib/ranking/funnel";

/**
 * Le o estado MAIS RECENTE de cada anuncio da marca (nao historico - pra historico
 * use get_metrics_history). AdMetricSnapshot acumula uma linha por coleta desde que
 * paramos de apagar (lib/ads/collect.ts), entao precisa de distinct pra nao repetir
 * o mesmo anuncio varias vezes.
 */
export async function getMetrics(brandId: string, args: GetMetricsArgs) {
  const snapshots = await prisma.adMetricSnapshot.findMany({
    where: {
      brandId,
      ...(args.platform ? { platform: args.platform } : {}),
    },
    orderBy: { collectedAt: "desc" },
    distinct: ["credentialId", "platformAdId"],
    take: args.limit,
  });

  return {
    count: snapshots.length,
    metrics: snapshots.map((snapshot) => ({
      platform: snapshot.platform,
      campaignId: snapshot.platformCampaignId,
      campaignName: snapshot.campaignName,
      adId: snapshot.platformAdId,
      adName: snapshot.adName,
      // Nivel intermediario (AdSet no Meta, AdGroup no Google) - nao confundir com
      // campanha nem com anuncio. adSetName vem null em coletas antigas, antes do
      // campo existir.
      adSetId: snapshot.platformAdSetId,
      adSetName: snapshot.adSetName,
      collectionState: snapshot.collectionState,
      funnelStage: classifyFunnelStage(snapshot.campaignName),
      spend: Number(snapshot.spend),
      impressions: snapshot.impressions,
      clicks: snapshot.clicks,
      ctr: Number(snapshot.ctr),
      cpc: Number(snapshot.cpc),
      conversions: snapshot.conversions,
      cpl: snapshot.cpl !== null ? Number(snapshot.cpl) : null,
      cpa: snapshot.cpa !== null ? Number(snapshot.cpa) : null,
      collectedAt: snapshot.collectedAt.toISOString(),
    })),
  };
}
