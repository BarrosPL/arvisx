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
export async function searchPublicAdLibrary(credentialId: string, args: SearchPublicAdLibraryArgs) {
  // A biblioteca publica e da Meta - qualquer credencial Meta do usuario serve de token
  // (o dado e publico, nao e da conta). Prefere a propria conta em questao; se ela for
  // do Google, cai em qualquer conta Meta que o usuario tenha.
  const credentialRecord =
    (await prisma.adCredential.findFirst({
      where: { id: credentialId, platform: "META" },
      include: { providerConnection: true },
    })) ??
    (await prisma.adCredential.findFirst({
      where: {
        platform: "META",
        providerConnection: {
          userId: (await prisma.adCredential.findUniqueOrThrow({
            where: { id: credentialId },
            select: { providerConnection: { select: { userId: true } } },
          })).providerConnection.userId,
        },
      },
      include: { providerConnection: true },
    }));
  if (!credentialRecord) {
    return { error: "Nenhuma conta Meta conectada ainda - nao da pra pesquisar a biblioteca publica sem isso." };
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
