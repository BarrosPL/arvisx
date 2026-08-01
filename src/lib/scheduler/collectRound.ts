import { prisma } from "@/lib/prisma";
import { collectAllCampaignsForAccount } from "@/lib/ads/collectCampaigns";
import { checkMetaThrottle, currentMetaThrottle } from "@/lib/ads/metaThrottle";

let isRunning = false;

/** Pausa entre contas - ver comentario no laco de runCollectRound. */
const ACCOUNT_DELAY_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CollectRoundResult {
  accounts: number;
  credentials: number;
  errors: number;
  skipped: boolean;
  /** Contas puladas por estarem perto do limite de cota da Meta - não é erro, é a
   * proteção funcionando (elas voltam na rodada seguinte, quando a cota já decaiu). */
  throttled: number;
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
 * Contas sao percorridas SEQUENCIALMENTE de proposito - disparar as ~27 contas em
 * paralelo a cada 15min foi o que fez a Meta devolver erro de excesso de requisicao
 * (code -1) na tentativa anterior de leitura ao vivo.
 */
export async function runCollectRound(): Promise<CollectRoundResult> {
  if (isRunning) {
    // Coleta anterior ainda rodando (mais lenta que o intervalo) - pular esta em vez de
    // empilhar duas em cima da mesma conta.
    return { accounts: 0, credentials: 0, errors: 0, skipped: true, throttled: 0 };
  }
  isRunning = true;

  try {
    const accounts = await prisma.adCredential.findMany({
      // Credencial em AUTH_ERROR ia falhar de novo a cada 15min, gastando chamada e
      // tempo a toa - volta sozinha pro ciclo quando uma reconexao consertar o status.
      where: { status: { not: "AUTH_ERROR" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, externalAccountId: true },
    });

    let credentials = 0;
    let errors = 0;
    let throttled = 0;

    for (const account of accounts) {
      // A Meta informa a cota consumida em cada resposta (metaThrottle.ts). Se a conta
      // anterior ja veio perto do teto, parar aqui e melhor do que insistir e levar o
      // erro de excesso de requisicao - a conta volta na proxima rodada, com a cota
      // ja decaida.
      const decision = checkMetaThrottle(account.externalAccountId);
      if (decision.backOff) {
        throttled += 1;
        console.log(`[coleta] conta ${account.externalAccountId} pulada - ${decision.reason}`);
        // Limite do APP e compartilhado entre todas as contas: nao adianta seguir pras
        // proximas, so gastaria chamada pra levar erro.
        if (decision.appLevel) {
          throttled += accounts.length - accounts.indexOf(account) - 1;
          console.log("[coleta] rodada interrompida - limite do app atingido");
          break;
        }
        continue;
      }

      const summaries = await collectAllCampaignsForAccount(account.id);
      credentials += summaries.length;
      errors += summaries.filter((s) => s.state === "AUTH_ERROR" || s.state === "API_ERROR").length;
      // Respiro entre contas: o processo do servidor web e o mesmo que roda isto, e
      // dezenas de contas em sequencia sem pausa deixavam a navegacao travada. Tambem
      // espaca as chamadas, o que e o que evita a plataforma recusar por excesso.
      await sleep(ACCOUNT_DELAY_MS);
    }

    const { appPct } = currentMetaThrottle();
    if (appPct !== null) {
      console.log(`[coleta] cota do app na Meta: ${appPct}%`);
    }

    return { accounts: accounts.length, credentials, errors, skipped: false, throttled };
  } finally {
    isRunning = false;
  }
}
