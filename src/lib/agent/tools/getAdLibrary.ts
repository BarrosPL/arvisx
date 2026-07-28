import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { GetAdLibraryArgs } from "@/lib/agent/schema";

const SEARCH_STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "e",
  "ou",
  "que",
  "para",
  "com",
  "os",
  "as",
  "um",
  "uma",
  "no",
  "na",
  "sobre",
  "ja",
  "publicamos",
  "anuncios",
  "anuncio",
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * "search" vem de linguagem natural do modelo (ex: "advogados brasileiros em
 * Portugal") - um `contains` literal da frase inteira quase nunca bate com o texto
 * real do anuncio (que tem outras palavras no meio). Em vez disso, quebra em palavras
 * significativas e casa qualquer uma delas em qualquer campo de texto - mais permissivo,
 * mas e o que faz uma busca por tema funcionar de verdade.
 */
function buildSearchFilter(searchTerm: string): Prisma.AdCreativeWhereInput {
  const words = normalize(searchTerm)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !SEARCH_STOPWORDS.has(word));

  const terms = words.length > 0 ? words : [searchTerm];

  return {
    OR: terms.flatMap((term) => [
      { adName: { contains: term, mode: "insensitive" } },
      { headline: { contains: term, mode: "insensitive" } },
      { bodyText: { contains: term, mode: "insensitive" } },
      { campaignName: { contains: term, mode: "insensitive" } },
    ]),
  };
}

/**
 * Biblioteca de criativos ja publicados (AdCreative) - diferente de get_metrics, aqui
 * traz o CONTEUDO do anuncio (headline/texto), nao a metrica, e inclui anuncio pausado/
 * sem gasto recente tambem. Usa pra reconhecer padrao do que ja funcionou.
 */
export async function getAdLibrary(brandId: string, args: GetAdLibraryArgs) {
  const searchTerm = args.search?.trim();

  const creatives = await prisma.adCreative.findMany({
    where: {
      brandId,
      ...(args.platform ? { platform: args.platform } : {}),
      ...(searchTerm ? buildSearchFilter(searchTerm) : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: args.limit,
  });

  return {
    count: creatives.length,
    creatives: creatives.map((creative) => ({
      platform: creative.platform,
      platformAdId: creative.platformAdId,
      adName: creative.adName,
      campaignName: creative.campaignName,
      status: creative.status,
      headline: creative.headline,
      bodyText: creative.bodyText,
    })),
  };
}
