/**
 * Dois ciclos independentes, de proposito:
 *
 * 1. COLETA (padrao 15min) - so busca metrica de campanha nas plataformas e grava.
 *    Barato: zero IA, zero proposta. E o que mantem o dashboard com dado fresco.
 * 2. ANALISE (padrao 6h) - a rodada proativa completa: coleta por anuncio, ranking,
 *    propostas e as chamadas de IA. Cara, entao continua rara.
 *
 * Antes existia um ciclo unico de 6h fazendo as duas coisas. Encurtar aquele intervalo
 * pra ter dado fresco teria multiplicado o custo de OpenAI e a criacao de propostas por
 * 24 - separar foi o que permitiu dado a cada 15min sem esse efeito colateral.
 */
const DEFAULT_ANALYSIS_INTERVAL_MINUTES = 360;
const DEFAULT_COLLECT_INTERVAL_MINUTES = 15;
/** Curta de proposito (retencao de lead nao e cara, e webhook de lead - fatia 7 - quer
 * latencia de minutos, nao horas). */
const DEFAULT_CONTENT_INTERVAL_MINUTES = 5;
/** Nao dispara logo no boot de proposito: subir uma versao nova e justamente quando o
 * usuario esta abrindo o sistema, e a coleta de dezenas de contas competindo com o
 * primeiro carregamento deixava tudo lento. 2min da tempo da navegacao inicial. */
const FIRST_COLLECT_DELAY_MS = 120_000;
const FIRST_ANALYSIS_DELAY_MS = 300_000;
const FIRST_CONTENT_DELAY_MS = 60_000;

const globalForScheduler = globalThis as unknown as {
  proactiveSchedulerStarted?: boolean;
};

/** Number("") e Number(undefined) dao 0/NaN e cairiam no default - mas Number("0") da 0
 * e tambem cai, o que e o comportamento desejado aqui (0 nao e intervalo valido). */
function intervalFromEnv(raw: string | undefined, fallbackMinutes: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMinutes;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (globalForScheduler.proactiveSchedulerStarted) {
    return;
  }
  globalForScheduler.proactiveSchedulerStarted = true;

  const analysisMinutes = intervalFromEnv(
    process.env.SCHEDULER_INTERVAL_MINUTES,
    DEFAULT_ANALYSIS_INTERVAL_MINUTES
  );
  const collectMinutes = intervalFromEnv(
    process.env.COLLECT_INTERVAL_MINUTES,
    DEFAULT_COLLECT_INTERVAL_MINUTES
  );
  const contentMinutes = intervalFromEnv(
    process.env.CONTENT_SCHEDULER_INTERVAL_MINUTES,
    DEFAULT_CONTENT_INTERVAL_MINUTES
  );

  const { runProactiveRound } = await import("@/lib/scheduler/proactiveRound");
  const { checkRunningAbTests } = await import("@/lib/scheduler/abTestCheck");
  const { runCollectRound } = await import("@/lib/scheduler/collectRound");
  const { runContentSchedulerRound } = await import("@/lib/content/scheduler/runContentSchedulerRound");

  async function collectTick() {
    try {
      const result = await runCollectRound();
      if (result.skipped) {
        console.log("[coleta] pulada - a anterior ainda estava rodando");
        return;
      }
      console.log(
        `[coleta] ${result.accounts} conta(s)` +
          (result.errors > 0 ? `, ${result.errors} com erro` : "") +
          (result.throttled > 0 ? `, ${result.throttled} adiada(s) por limite de cota` : "")
      );
    } catch (error) {
      console.error("[coleta] falhou:", error);
    }
  }

  async function analysisTick() {
    try {
      const { checked, completed } = await checkRunningAbTests();
      if (checked > 0) {
        console.log(`[scheduler] testes A/B verificados: ${checked}, concluídos: ${completed}`);
      }
    } catch (error) {
      console.error("[scheduler] checagem de testes A/B falhou:", error);
    }

    try {
      const { runId } = await runProactiveRound();
      console.log(`[scheduler] rodada proativa concluída (runId=${runId})`);
    } catch (error) {
      console.error("[scheduler] rodada proativa falhou:", error);
    }
  }

  async function contentTick() {
    try {
      const result = await runContentSchedulerRound();
      if (result.retention.deleted > 0) {
        console.log(`[conteudo] retenção: ${result.retention.deleted} lead(s) apagado(s)`);
      }
    } catch (error) {
      console.error("[conteudo] rodada falhou:", error);
    }
  }

  // A coleta comeca antes da analise de proposito - assim a primeira tela ja tem dado
  // fresco sem esperar a rodada cara terminar.
  setTimeout(() => {
    collectTick();
    setInterval(collectTick, collectMinutes * 60 * 1000);
  }, FIRST_COLLECT_DELAY_MS);

  setTimeout(() => {
    analysisTick();
    setInterval(analysisTick, analysisMinutes * 60 * 1000);
  }, FIRST_ANALYSIS_DELAY_MS);

  setTimeout(() => {
    contentTick();
    setInterval(contentTick, contentMinutes * 60 * 1000);
  }, FIRST_CONTENT_DELAY_MS);

  console.log(
    `[scheduler] agendado - coleta a cada ${collectMinutes}min (sem IA), análise a cada ${analysisMinutes}min, conteúdo a cada ${contentMinutes}min`
  );
}
