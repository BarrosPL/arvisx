/**
 * Leitura do cabecalho `X-FB-Ads-Insights-Throttle`, que a Meta manda em TODA resposta
 * de Insights dizendo quanto da cota ja foi consumida.
 *
 * Existe por causa de um problema real: a coleta rodava as cegas e o Facebook chegou a
 * recusar com "code -1" (excesso de dados requisitados). A recomendacao oficial e parar
 * de consultar por volta de 80% de utilizacao - sem ler este cabecalho nao ha como saber
 * que se esta chegando la.
 *
 * Duas cotas independentes:
 * - `app_id_util_pct`: do app inteiro. Se estourar, TUDO para (nao adianta trocar de
 *   conta, a cota e compartilhada).
 * - `acc_id_util_pct`: da conta de anuncio especifica. Só aquela conta para; as outras
 *   seguem normalmente.
 */

const BACKOFF_THRESHOLD_PCT = 80;

/** Leitura mais velha que isto e ignorada: a cota da Meta decai com o tempo, entao um
 * numero antigo nao deve bloquear a rodada seguinte (que roda 15min depois). Na pratica
 * isto protege DENTRO de uma rodada - as contas seguintes veem o que as anteriores
 * mediram, segundos antes. */
const READING_TTL_MS = 5 * 60 * 1000;

interface Reading {
  pct: number;
  at: number;
}

const state: { app: Reading | null; byAccount: Map<string, Reading> } = {
  app: null,
  byAccount: new Map(),
};

interface ThrottlePayload {
  app_id_util_pct?: number;
  acc_id_util_pct?: number;
  ads_api_access_tier?: string;
}

/** Le o cabecalho de uma resposta da Graph API e guarda o estado. Nunca lanca - um
 * cabecalho ausente ou malformado so significa "sem informacao", nao um erro. */
export function recordMetaThrottle(response: Response, accountKey: string): void {
  const raw = response.headers.get("x-fb-ads-insights-throttle");
  if (!raw) return;

  let payload: ThrottlePayload;
  try {
    payload = JSON.parse(raw) as ThrottlePayload;
  } catch {
    return;
  }

  const now = Date.now();
  if (typeof payload.app_id_util_pct === "number") {
    state.app = { pct: payload.app_id_util_pct, at: now };
  }
  if (typeof payload.acc_id_util_pct === "number") {
    state.byAccount.set(accountKey, { pct: payload.acc_id_util_pct, at: now });
  }
}

function fresh(reading: Reading | null | undefined): Reading | null {
  if (!reading) return null;
  return Date.now() - reading.at <= READING_TTL_MS ? reading : null;
}

export interface ThrottleDecision {
  /** true quando a coleta desta conta deve ser pulada nesta rodada. */
  backOff: boolean;
  /** Motivo legivel, pra ir pro log/telemetria em vez de um pulo silencioso. */
  reason?: string;
  /** true quando o limite e do APP - quem chama deve parar a rodada inteira, nao so
   * esta conta (a cota e compartilhada entre todas). */
  appLevel?: boolean;
}

/** Decide se vale consultar a Meta pra esta conta agora. */
export function checkMetaThrottle(accountKey: string): ThrottleDecision {
  const app = fresh(state.app);
  if (app && app.pct >= BACKOFF_THRESHOLD_PCT) {
    return {
      backOff: true,
      appLevel: true,
      reason: `cota do app em ${app.pct}% (limite de segurança: ${BACKOFF_THRESHOLD_PCT}%)`,
    };
  }

  const account = fresh(state.byAccount.get(accountKey));
  if (account && account.pct >= BACKOFF_THRESHOLD_PCT) {
    return {
      backOff: true,
      reason: `cota desta conta em ${account.pct}% (limite de segurança: ${BACKOFF_THRESHOLD_PCT}%)`,
    };
  }

  return { backOff: false };
}

/** Só pra observabilidade (log da rodada) - não decide nada. */
export function currentMetaThrottle(): { appPct: number | null } {
  return { appPct: fresh(state.app)?.pct ?? null };
}

/** Usado só em teste, pra isolar um caso do outro. */
export function resetMetaThrottleForTests(): void {
  state.app = null;
  state.byAccount.clear();
}
