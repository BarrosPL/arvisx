/**
 * Rate limit de janela deslizante, em memoria.
 *
 * Escolha consciente de guardar em memoria e nao no Postgres: o alvo (login) e
 * justamente o endpoint que um atacante martela, entao gravar uma linha por tentativa
 * transformaria o proprio mecanismo de defesa em amplificador de carga no banco.
 *
 * PREMISSA: uma instancia so da aplicacao (e o caso hoje - um container no EasyPanel).
 * Com N replicas o limite efetivo vira N vezes maior, porque cada processo tem o proprio
 * mapa. Se um dia rodar em mais de uma replica, isto aqui precisa migrar pra um store
 * compartilhado (Redis, ou uma tabela no Postgres) - nao e algo que degrada em silencio
 * pela metade, o numero simplesmente multiplica.
 *
 * Reiniciar o processo zera os contadores. Aceitavel: o atacante nao controla quando o
 * container reinicia.
 */

export interface RateLimitRule {
  /** Quantas falhas sao toleradas dentro da janela. */
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitVerdict {
  readonly blocked: boolean;
  /** Quanto falta pra proxima tentativa ser aceita. Zero quando nao esta bloqueado. */
  readonly retryAfterSeconds: number;
}

interface Bucket {
  /** Instantes das falhas recentes, do mais antigo pro mais novo. */
  hits: number[];
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

/** Teto de chaves rastreadas. Sem isto, um atacante variando o email a cada tentativa
 * criaria uma chave nova por requisicao e o mapa cresceria sem limite ate estourar a
 * memoria do container - ou seja, o proprio rate limit viraria o vetor de DoS. */
const MAX_TRACKED_KEYS = 20_000;
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

/** Descarta os registros que ja sairam da janela e devolve o que sobrou. */
function activeHits(key: string, windowMs: number, now: number): number[] {
  const bucket = buckets.get(key);
  if (!bucket) return [];
  const cutoff = now - windowMs;
  return bucket.hits.filter((at) => at > cutoff);
}

/** Limpeza preguicosa: roda junto com as escritas em vez de num setInterval, que
 * seguraria o processo vivo e nao roda em ambiente serverless. */
function sweep(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS && buckets.size < MAX_TRACKED_KEYS) return;
  lastSweepAt = now;

  for (const [key, bucket] of buckets) {
    const last = bucket.hits[bucket.hits.length - 1];
    if (last === undefined || last <= now - bucket.windowMs) buckets.delete(key);
  }

  // Se mesmo depois da limpeza o mapa continua estourado, e porque o ataque esta em curso
  // agora. Zera tudo: perder contadores momentaneamente e melhor que derrubar o processo,
  // e o atacante precisa recomecar a contagem do zero de qualquer forma.
  if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
}

/**
 * Consulta sem contabilizar. Chamado ANTES de tentar a senha: quando ja esta bloqueado,
 * a tentativa nem vira um registro novo. Isso e de proposito - se tentativa bloqueada
 * tambem contasse, a janela ficaria empurrada pra frente a cada batida e quem estivesse
 * atras do mesmo IP nunca sairia do bloqueio.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitVerdict {
  const now = Date.now();
  const hits = activeHits(key, rule.windowMs, now);
  if (hits.length < rule.limit) return { blocked: false, retryAfterSeconds: 0 };

  const oldest = hits[0];
  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
  };
}

/** Contabiliza UMA falha. So falha - login que deu certo nao consome cota de ninguem. */
export function registerFailure(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  sweep(now);

  const hits = activeHits(key, rule.windowMs, now);
  hits.push(now);
  // Guardar mais que `limit` instantes nao muda decisao nenhuma e so gastaria memoria.
  if (hits.length > rule.limit) hits.splice(0, hits.length - rule.limit);

  buckets.set(key, { hits, windowMs: rule.windowMs });
}

/** Zera o balde depois de um login bem-sucedido, pra que erros de digitacao de quem
 * realmente tem a senha nao se acumulem ate travar a propria conta. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Só para os testes - a suite precisa de estado limpo entre um caso e outro. */
export function resetAllRateLimits(): void {
  buckets.clear();
  lastSweepAt = 0;
}
