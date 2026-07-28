import type { Platform } from "@/generated/prisma/client";
import type { FunnelStage } from "./funnel";

export interface RankableRow {
  platform: Platform;
  platformCampaignId: string | null;
  campaignName: string | null;
  platformAdId: string | null;
  adName: string | null;
  platformAdSetId: string | null;
  funnelStage: FunnelStage | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpl: number | null;
  cpa: number | null;
}

export interface RankingBuckets {
  spendNoConversion: RankableRow[];
  lowCtr: RankableRow[];
  highCpl: RankableRow[];
  scaleCandidates: RankableRow[];
  needsNewCreative: RankableRow[];
}
