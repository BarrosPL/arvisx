const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export interface TavilySearchItem {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResult {
  /** false quando TAVILY_API_KEY nao esta configurada - diferente de errorMessage
   * (que e falha de uma chamada que TENTOU rodar). Os dois casos tem que virar
   * mensagens diferentes pro usuario (ver tools/research.ts). */
  configured: boolean;
  items: TavilySearchItem[];
  errorMessage?: string;
}

interface TavilyApiResultRow {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilyApiResponse {
  results?: TavilyApiResultRow[];
  detail?: { error?: string };
}

/**
 * Busca na web ao vivo via Tavily (api.tavily.com/search) - existe especificamente pra
 * cobrir spec-gestor-trafego-ia.md secao 4.2 ("ganchos virais/noticias recentes"), que
 * nao tem nenhuma fonte de dado dentro do sistema (nao e Meta/Google Ads, e busca geral
 * na web). Contrato conferido na doc oficial da Tavily antes de implementar: POST com
 * Authorization: Bearer, corpo JSON com query/topic/max_results/time_range, resposta
 * com "results[].{title,url,content,score}".
 */
export async function searchTavily(
  query: string,
  options?: { topic?: "general" | "news"; timeRange?: "day" | "week" | "month"; maxResults?: number }
): Promise<TavilySearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { configured: false, items: [] };
  }

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        topic: options?.topic ?? "general",
        max_results: options?.maxResults ?? 5,
        time_range: options?.timeRange,
      }),
    });

    const body = (await response.json()) as TavilyApiResponse;

    if (!response.ok) {
      throw new Error(`Tavily API error (${response.status}): ${body.detail?.error ?? response.statusText}`);
    }

    const items: TavilySearchItem[] = (body.results ?? [])
      .filter((row) => row.title && row.url)
      .map((row) => ({
        title: row.title!,
        url: row.url!,
        content: row.content ?? "",
        score: typeof row.score === "number" ? row.score : 0,
      }));

    return { configured: true, items };
  } catch (error) {
    return { configured: true, items: [], errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
