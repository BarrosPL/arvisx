import { runLeadRetentionRound } from "./leadRetention";
import { runWebhookDispatchRound } from "./webhookDispatch";

/**
 * Rodada periodica do modulo de conteudo - separada da rodada do gestor de trafego
 * (runProactiveRound) de proposito: cadencia bem mais curta (retencao/webhook nao
 * precisam de 6h, mas tambem nao sao caros como as chamadas de IA daquela rodada).
 */
export async function runContentSchedulerRound() {
  const webhooks = await runWebhookDispatchRound();
  const retention = await runLeadRetentionRound();
  return { webhooks, retention };
}
