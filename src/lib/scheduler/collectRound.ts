import { prisma } from "@/lib/prisma";
import { collectAllCampaignsForBrand } from "@/lib/ads/collectCampaigns";

let isRunning = false;

/** Pausa entre marcas - ver comentario no laco de runCollectRound. */
const BRAND_DELAY_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CollectRoundResult {
  brands: number;
  credentials: number;
  errors: number;
  skipped: boolean;
}

/**
 * Ciclo RAPIDO do scheduler (a cada COLLECT_INTERVAL_MINUTES, padrao 15min): so coleta
 * metrica no nivel de campanha pra alimentar o dashboard com dado fresco.
 *
 * Deliberadamente NAO faz nada do que a rodada de analise faz - sem ranking, sem
 * proposta, sem NENHUMA chamada de IA. Foi por isso que os dois ciclos foram separados:
 * encurtar a rodada unica de 6h pra 15min multiplicaria custo de OpenAI e criacao de
 * proposta por 24, sem nenhum ganho (o que o usuario queria era so dado fresco na tela).
 *
 * Marcas sao percorridas SEQUENCIALMENTE de proposito - disparar as ~27 contas em
 * paralelo a cada 15min foi o que fez a Meta devolver erro de excesso de requisicao
 * (code -1) na tentativa anterior de leitura ao vivo.
 */
export async function runCollectRound(): Promise<CollectRoundResult> {
  if (isRunning) {
    // Coleta anterior ainda rodando (mais lenta que o intervalo) - pular esta em vez de
    // empilhar duas em cima da mesma conta.
    return { brands: 0, credentials: 0, errors: 0, skipped: true };
  }
  isRunning = true;

  try {
    const brands = await prisma.brand.findMany({
      where: {
        // So marca com credencial que ainda autentica. Credencial em AUTH_ERROR ia
        // falhar de novo a cada 15min, gastando chamada e tempo a toa - volta sozinha
        // pro ciclo quando a rodada de analise (6h) ou uma reconexao consertar o status.
        credentials: { some: { status: { not: "AUTH_ERROR" } } },
      },
      orderBy: { priorityOrder: "asc" },
      select: { id: true },
    });

    let credentials = 0;
    let errors = 0;

    for (const brand of brands) {
      const summaries = await collectAllCampaignsForBrand(brand.id);
      credentials += summaries.length;
      errors += summaries.filter((s) => s.state === "AUTH_ERROR" || s.state === "API_ERROR").length;
      // Respiro entre marcas: o processo do servidor web e o mesmo que roda isto, e
      // dezenas de contas em sequencia sem pausa deixavam a navegacao travada. Tambem
      // espaca as chamadas, o que e o que evita a plataforma recusar por excesso.
      await sleep(BRAND_DELAY_MS);
    }

    return { brands: brands.length, credentials, errors, skipped: false };
  } finally {
    isRunning = false;
  }
}
