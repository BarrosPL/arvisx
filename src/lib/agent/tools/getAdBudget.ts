import { prisma } from "@/lib/prisma";
import { toPlatformCredential } from "@/lib/ads/credentials";
import { getMetaBudget } from "@/lib/ads/metaWrite";
import { getGoogleCampaignBudget } from "@/lib/ads/googleWrite";

export interface GetAdBudgetArgs {
  platform: "META" | "GOOGLE";
  platformAdSetId?: string | null;
  platformCampaignId?: string | null;
}

/**
 * Busca a verba diaria REAL de uma campanha/adset direto na API do Meta/Google -
 * so leitura, nunca escreve nada. E o dado que faltava pra JAMILE propor um valor
 * de verba concreto (currentBudget/proposedBudget) em vez de so texto descritivo.
 */
export async function getAdBudget(credentialId: string, args: GetAdBudgetArgs) {
  const credentialRecord = await prisma.adCredential.findFirst({
    where: { id: credentialId, platform: args.platform },
    include: { providerConnection: true },
  });
  if (!credentialRecord) {
    return { error: "Essa conta de anuncio nao e dessa plataforma." };
  }
  const credential = toPlatformCredential(credentialRecord);

  if (args.platform === "META") {
    if (!args.platformAdSetId) {
      return { error: "platformAdSetId e obrigatorio para buscar verba no Meta." };
    }
    const result = await getMetaBudget(credential, args.platformAdSetId);
    if (result.errorMessage) return { error: result.errorMessage };
    if (result.dailyBudgetMinorUnits === null) {
      return { error: "Não foi possível encontrar a verba (nem no AdSet, nem na campanha)." };
    }
    return {
      dailyBudget: result.dailyBudgetMinorUnits / 100,
      budgetLevel: result.level === "CAMPAIGN" ? "campanha (CBO)" : "conjunto de anúncios",
    };
  }

  if (!args.platformCampaignId) {
    return { error: "platformCampaignId e obrigatorio para buscar verba no Google Ads." };
  }
  const result = await getGoogleCampaignBudget(credential, args.platformCampaignId);
  if (result.errorMessage) return { error: result.errorMessage };
  return {
    dailyBudget: result.amountMicros !== null ? result.amountMicros / 1_000_000 : null,
  };
}
