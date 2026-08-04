import { searchTavily, type TavilySearchResult } from "@/lib/research/tavily";
import type { ResearchQueryArgs } from "@/lib/agent/schema";

function shapeResult(query: string, result: TavilySearchResult) {
  if (!result.configured) {
    return { ok: false, query, message: "sem fonte de dado ao vivo configurada" };
  }
  if (result.errorMessage) {
    return { ok: false, query, error: result.errorMessage };
  }
  return {
    ok: true,
    query,
    results: result.items.map((item) => ({ title: item.title, url: item.url, snippet: item.content })),
  };
}

/**
 * spec-gestor-trafego-ia.md secao 4.2, item 2: "identificar ganchos virais/noticias
 * recentes que possam ser aproveitados no criativo" - topic "news" + janela de 1
 * semana, pra favorecer o que esta em alta AGORA (diferente de search_public_ad_library,
 * que e sobre anuncio ja publicado, nao sobre assunto/noticia do momento).
 */
export async function researchMarket(args: ResearchQueryArgs) {
  const result = await searchTavily(args.query, { topic: "news", timeRange: "week", maxResults: 6 });
  return shapeResult(args.query, result);
}

/**
 * Busca geral na web sobre um concorrente (site, imprensa, blog) - complementa
 * search_public_ad_library (que so cobre o que o concorrente publica na Meta Ad
 * Library), pra cobrir o que ele esta comunicando fora da Meta tambem.
 */
export async function scanCompetitors(args: ResearchQueryArgs) {
  const result = await searchTavily(args.query, { topic: "general", maxResults: 6 });
  return shapeResult(args.query, result);
}
