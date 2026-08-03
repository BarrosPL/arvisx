import { prisma } from "@/lib/prisma";
import { toPlatformCredential } from "@/lib/ads/credentials";
import { fetchMetaHistoricalWindows } from "@/lib/ads/metaCampaigns";
import type { GetHistoricalPerformanceArgs } from "@/lib/agent/schema";

/**
 * Performance em multiplas janelas de lookback (spec-gestor-trafego-ia.md secao 4.3) -
 * so Meta nesta versao (Google Ads fica pra depois, mesmo escopo das outras
 * capacidades adicionadas nesta sessao). Chamada AO VIVO na Meta (nao ha historico
 * proprio suficiente no Postgres pra janelas de 360/720 dias - a coleta comecou ha
 * poucos dias) - sob demanda, quando a JAMILE for pesquisar antes de propor algo, nao
 * em background.
 */
export async function getHistoricalPerformance(credentialId: string, args: GetHistoricalPerformanceArgs) {
  const credentialRecord = await prisma.adCredential.findFirst({
    where: { id: credentialId, platform: "META" },
    include: { providerConnection: true },
  });
  if (!credentialRecord) {
    return { error: "Performance historica em multiplas janelas so esta disponivel para contas Meta nesta versao." };
  }

  const windows = await fetchMetaHistoricalWindows(toPlatformCredential(credentialRecord), {
    campaignId: args.platformCampaignId,
    windowsDays: args.windowsDays,
  });

  return {
    scope: args.platformCampaignId ? "campanha especifica" : "conta inteira",
    platformCampaignId: args.platformCampaignId ?? null,
    windows,
  };
}
