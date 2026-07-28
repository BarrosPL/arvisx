import { prisma } from "@/lib/prisma";
import { CollectionState } from "@/generated/prisma/client";
import { classifyRows } from "./classify";
import { buildVerdict } from "./verdict";
import { classifyFunnelStage } from "./funnel";
import type { RankableRow } from "./types";

export async function computeAndSaveRanking(brandId: string) {
  // So a coleta mais recente por (credencial, anuncio) - o historico de coletas
  // anteriores fica acumulado em AdMetricSnapshot (lib/ads/collect.ts nao apaga
  // mais), mas o ranking sempre le so o estado mais fresco de cada anuncio.
  const snapshots = await prisma.adMetricSnapshot.findMany({
    where: { brandId, collectionState: CollectionState.OK },
    orderBy: { collectedAt: "desc" },
    distinct: ["credentialId", "platformAdId"],
  });

  const rows: RankableRow[] = snapshots.map((snapshot) => ({
    platform: snapshot.platform,
    platformCampaignId: snapshot.platformCampaignId,
    campaignName: snapshot.campaignName,
    platformAdId: snapshot.platformAdId,
    adName: snapshot.adName,
    platformAdSetId: snapshot.platformAdSetId,
    funnelStage: classifyFunnelStage(snapshot.campaignName),
    spend: Number(snapshot.spend),
    impressions: snapshot.impressions,
    clicks: snapshot.clicks,
    ctr: Number(snapshot.ctr),
    cpc: Number(snapshot.cpc),
    conversions: snapshot.conversions,
    cpl: snapshot.cpl !== null ? Number(snapshot.cpl) : null,
    cpa: snapshot.cpa !== null ? Number(snapshot.cpa) : null,
  }));

  const buckets = classifyRows(rows);
  const { verdict, recommendedActions } = buildVerdict(buckets);

  const sourceRangeEnd = new Date();
  const sourceRangeStart =
    snapshots.length > 0
      ? snapshots.reduce(
          (earliest, snapshot) => (snapshot.dateRangeStart < earliest ? snapshot.dateRangeStart : earliest),
          snapshots[0].dateRangeStart
        )
      : sourceRangeEnd;

  return prisma.rankingSnapshot.create({
    data: {
      brandId,
      verdict,
      bucketsJson: JSON.parse(JSON.stringify(buckets)),
      recommendedActionsJson: JSON.parse(JSON.stringify(recommendedActions)),
      sourceRangeStart,
      sourceRangeEnd,
    },
  });
}
