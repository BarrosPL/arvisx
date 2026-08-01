import { prisma } from "@/lib/prisma";
import type { GetAdSetsArgs } from "@/lib/agent/schema";

/**
 * Agrupa o estado mais recente de cada anuncio por conjunto de anuncios (AdSet no
 * Meta, AdGroup no Google) e conta/soma em CODIGO - nunca deixa a JAMILE contar ou
 * agrupar uma lista crua de anuncios sozinha (get_metrics), que e onde ela errava
 * perguntas tipo "quantos anuncios tem em cada conjunto" (contagem manual de LLM
 * sobre uma lista e pouco confiavel, e o get_metrics ainda por cima truncava pelo
 * limit sem avisar).
 */
export async function getAdSets(credentialId: string, args: GetAdSetsArgs) {
  const snapshots = await prisma.adMetricSnapshot.findMany({
    where: {
      credentialId,
      collectionState: "OK",
      ...(args.platform ? { platform: args.platform } : {}),
    },
    orderBy: { collectedAt: "desc" },
    distinct: ["credentialId", "platformAdId"],
  });

  interface AdSetGroup {
    platform: string;
    campaignId: string | null;
    campaignName: string | null;
    adSetId: string | null;
    adSetName: string | null;
    adCount: number;
    spend: number;
    conversions: number;
  }

  const groups = new Map<string, AdSetGroup>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.platform}:${snapshot.platformAdSetId ?? "sem-id"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.adCount += 1;
      existing.spend += Number(snapshot.spend);
      existing.conversions += snapshot.conversions;
      // Se coletas diferentes do mesmo AdSet trouxerem nomes diferentes (raro, ex:
      // renomeado na plataforma), fica com o nome nao-nulo mais recente.
      if (!existing.adSetName && snapshot.adSetName) existing.adSetName = snapshot.adSetName;
    } else {
      groups.set(key, {
        platform: snapshot.platform,
        campaignId: snapshot.platformCampaignId,
        campaignName: snapshot.campaignName,
        adSetId: snapshot.platformAdSetId,
        adSetName: snapshot.adSetName,
        adCount: 1,
        spend: Number(snapshot.spend),
        conversions: snapshot.conversions,
      });
    }
  }

  return {
    totalAds: snapshots.length,
    totalAdSets: groups.size,
    adSets: Array.from(groups.values()).sort((a, b) => b.adCount - a.adCount),
  };
}
