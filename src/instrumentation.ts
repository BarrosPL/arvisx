const DEFAULT_INTERVAL_MINUTES = 360;
const FIRST_RUN_DELAY_MS = 30_000;

const globalForScheduler = globalThis as unknown as {
  proactiveSchedulerStarted?: boolean;
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (globalForScheduler.proactiveSchedulerStarted) {
    return;
  }
  globalForScheduler.proactiveSchedulerStarted = true;

  const intervalMinutes = Number(process.env.SCHEDULER_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES;
  const intervalMs = intervalMinutes * 60 * 1000;

  const { runProactiveRound } = await import("@/lib/scheduler/proactiveRound");
  const { checkRunningAbTests } = await import("@/lib/scheduler/abTestCheck");

  async function tick() {
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

  setTimeout(() => {
    tick();
    setInterval(tick, intervalMs);
  }, FIRST_RUN_DELAY_MS);

  console.log(`[scheduler] agendado - primeira rodada em ${FIRST_RUN_DELAY_MS / 1000}s, depois a cada ${intervalMinutes}min`);
}
