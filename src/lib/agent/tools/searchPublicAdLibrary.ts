import { prisma } from "@/lib/prisma";
import { toPlatformCredential } from "@/lib/ads/credentials";
import { searchPublicAdLibrary as searchLibrary } from "@/lib/ads/publicAdLibrary";
import type { SearchPublicAdLibraryArgs } from "@/lib/agent/schema";

/**
 * Biblioteca PUBLICA da Meta (concorrencia/mercado) - diferente de get_ad_library
 * (que le so os anuncios da PROPRIA conta). So existe pra Meta (Google Ads Transparency
 * Center nao tem API publica), mas serve de referencia de criativo/mensagem pra
 * recomendacao em QUALQUER plataforma, incluindo Google Ads - a linguagem que funciona
 * num anuncio real de mercado nao e exclusiva de onde foi vista.
 */
export async function searchPublicAdLibrary(brandId: string, args: SearchPublicAdLibraryArgs) {
  const credentialRecord = await prisma.adCredential.findFirst({
    where: { brandId, platform: "META" },
    include: { providerConnection: true },
  });
  if (!credentialRecord) {
    return { error: "Nenhuma conta Meta conectada a esta marca ainda - nao da pra pesquisar a biblioteca publica sem isso." };
  }

  const result = await searchLibrary(toPlatformCredential(credentialRecord), {
    query: args.query,
    countries: args.countries,
  });

  if (result.errorMessage) {
    return { error: result.errorMessage };
  }

  return {
    count: result.items.length,
    ads: result.items.map((item) => ({
      pageName: item.pageName,
      bodyText: item.bodyText,
      deliveryStartDate: item.deliveryStartDate,
    })),
  };
}
