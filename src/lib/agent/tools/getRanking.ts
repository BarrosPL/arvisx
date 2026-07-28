import { prisma } from "@/lib/prisma";
import { computeAndSaveRanking } from "@/lib/ranking/compute";

const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Sem args: reusa o RankingSnapshot mais recente se ainda estiver fresco, senao recalcula. */
export async function getRanking(brandId: string) {
  const latest = await prisma.rankingSnapshot.findFirst({
    where: { brandId },
    orderBy: { computedAt: "desc" },
  });

  const isFresh = latest && Date.now() - latest.computedAt.getTime() < FRESH_WINDOW_MS;
  const snapshot = isFresh ? latest : await computeAndSaveRanking(brandId);

  return {
    verdict: snapshot.verdict,
    computedAt: snapshot.computedAt.toISOString(),
    buckets: snapshot.bucketsJson,
    recommendedActions: snapshot.recommendedActionsJson,
  };
}
