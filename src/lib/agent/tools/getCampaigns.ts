import { prisma } from "@/lib/prisma";
import type { GetCampaignsArgs } from "@/lib/agent/schema";

/**
 * Le a metrica no nivel de CAMPANHA (tabela CampaignMetricSnapshot, alimentada pelo
 * ciclo de coleta de 15min). Diferente de get_metrics/get_ad_sets, que trabalham no
 * nivel de anuncio/conjunto, aqui dois numeros so existem corretos:
 * - "reach" (alcance): deduplicado pela propria plataforma. Somar o alcance dos
 *   anuncios de uma campanha contaria a mesma pessoa varias vezes.
 * - "results"/"cpr": o resultado ja resolvido pelo OBJETIVO da campanha, igual a
 *   coluna "Resultados" do Gerenciador de Anuncios (ver lib/ads/resultMetric.ts).
 */
export async function getCampaigns(credentialId: string, args: GetCampaignsArgs) {
  const snapshots = await prisma.campaignMetricSnapshot.findMany({
    where: {
      credentialId,
      collectionState: "OK",
      ...(args.platform ? { platform: args.platform } : {}),
    },
    orderBy: { collectedAt: "desc" },
    distinct: ["credentialId", "platformCampaignId"],
  });

  const activeOnly = args.onlyActive ?? false;
  const rows = snapshots
    .filter((snapshot) => {
      if (!snapshot.platformCampaignId) return false;
      if (!activeOnly) return true;
      const status = (snapshot.campaignStatus ?? "").toUpperCase();
      return status === "ACTIVE" || status === "ENABLED";
    })
    .map((snapshot) => ({
      platform: snapshot.platform,
      campaignId: snapshot.platformCampaignId,
      campaignName: snapshot.campaignName,
      status: snapshot.campaignStatus,
      objective: snapshot.objective,
      spend: Number(snapshot.spend),
      impressions: snapshot.impressions,
      clicks: snapshot.clicks,
      ctr: Number(snapshot.ctr),
      cpc: Number(snapshot.cpc),
      results: snapshot.results,
      /** Qual acao foi contada como resultado (ex: "lead", "link_click"). */
      resultType: snapshot.resultType,
      cpr: snapshot.cpr !== null ? Number(snapshot.cpr) : null,
      reach: snapshot.reach,
      frequency: snapshot.frequency !== null ? Number(snapshot.frequency) : null,
      cpm: snapshot.cpm !== null ? Number(snapshot.cpm) : null,
      collectedAt: snapshot.collectedAt.toISOString(),
    }))
    .sort((a, b) => b.spend - a.spend);

  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
  const totalResults = rows.reduce((sum, row) => sum + row.results, 0);

  return {
    totalCampaigns: rows.length,
    totalSpend,
    totalResults,
    // Recalculado a partir das somas - media dos CPRs de cada campanha daria numero errado.
    averageCpr: totalResults > 0 ? totalSpend / totalResults : null,
    periodDays: 7,
    campaigns: rows,
  };
}
