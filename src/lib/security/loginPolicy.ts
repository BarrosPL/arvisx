import { z } from "zod";
import { checkRateLimit, clearRateLimit, registerFailure, type RateLimitRule } from "./rateLimit";

/**
 * Regras de forca bruta no login. Sao DUAS de proposito, porque cobrem ataques diferentes:
 *
 * - PER_IDENTITY (IP + email): alguem tentando adivinhar a senha de UMA conta.
 * - PER_IP: alguem varrendo MUITAS contas a partir do mesmo lugar (password spraying),
 *   que passaria folgado pela regra de cima, ja que cada email tem seu proprio balde.
 *
 * Nao existe uma regra "por email, de qualquer IP" - e tentador, mas seria um jeito
 * pronto de qualquer pessoa da internet trancar a conta do Renan de fora, so errando a
 * senha dele algumas vezes. Bloqueio por identidade sempre carrega o IP junto.
 */
export const PER_IDENTITY: RateLimitRule = { limit: 5, windowMs: 15 * 60 * 1000 };
export const PER_IP: RateLimitRule = { limit: 20, windowMs: 15 * 60 * 1000 };

/**
 * Validacao da entrada do login.
 *
 * Isto NAO e defesa contra SQL injection - o Prisma ja parametriza toda query, entao
 * nao existe concatenacao de string pra injetar (ver o teste em loginPolicy.test.ts, que
 * prova isso com payload de injecao de verdade). O que esta validacao faz e outra coisa,
 * igualmente util: rejeitar entrada absurda ANTES de encostar no banco e no bcrypt.
 *
 * O limite de 254 no email e o maximo de um endereco valido (RFC 5321); o de 200 na senha
 * evita que alguem mande megabytes num campo que o bcrypt trunca em 72 bytes de qualquer
 * jeito. Nao normalizo o email pra minusculo aqui de proposito: o banco guarda como foi
 * cadastrado, e mexer nisso mudaria em silencio quem consegue entrar.
 */
export const loginCredentialsSchema = z.object({
  email: z.string().trim().min(1).max(254).email(),
  password: z.string().min(1).max(200),
});

export interface LoginAttemptKeys {
  readonly identity: string;
  readonly ip: string;
}

/** O email entra na chave em minusculo pra que Renan@x.com e renan@x.com nao rendam dois
 * baldes separados - senao bastaria variar a caixa das letras pra multiplicar a cota. */
export function loginKeysFor(ip: string, email: string): LoginAttemptKeys {
  return {
    identity: `login:id:${ip}:${email.trim().toLowerCase()}`,
    ip: `login:ip:${ip}`,
  };
}

export interface LoginThrottleVerdict {
  readonly blocked: boolean;
  readonly retryAfterSeconds: number;
}

/** Consulta as duas regras. Quem estiver bloqueado por mais tempo manda na resposta. */
export function checkLoginThrottle(keys: LoginAttemptKeys): LoginThrottleVerdict {
  const identity = checkRateLimit(keys.identity, PER_IDENTITY);
  const ip = checkRateLimit(keys.ip, PER_IP);

  if (!identity.blocked && !ip.blocked) return { blocked: false, retryAfterSeconds: 0 };
  return {
    blocked: true,
    retryAfterSeconds: Math.max(identity.retryAfterSeconds, ip.retryAfterSeconds),
  };
}

export function registerLoginFailure(keys: LoginAttemptKeys): void {
  registerFailure(keys.identity, PER_IDENTITY);
  registerFailure(keys.ip, PER_IP);
}

/** Login certo limpa o balde da identidade. O balde do IP NAO e limpo: senao um atacante
 * que tambem tem uma conta valida no sistema zeraria a cota de varredura quando quisesse,
 * so entrando na propria conta entre uma rodada e outra. */
export function registerLoginSuccess(keys: LoginAttemptKeys): void {
  clearRateLimit(keys.identity);
}

/**
 * Hash descartavel usado quando o email nem existe.
 *
 * Sem isto o login vaza quais emails estao cadastrados: usuario inexistente responde na
 * hora, usuario existente demora os ~100ms do bcrypt. Da pra enumerar a base inteira so
 * cronometrando. Comparar contra este hash faz os dois caminhos custarem o mesmo. O valor
 * nao e segredo - e so um hash bcrypt valido de uma senha aleatoria que ninguem conhece.
 */
export const DUMMY_PASSWORD_HASH = "$2b$10$NBDfcpqXRRq6Eo0Fn4h4aOS1QYNJ3e3rUf0KdnqL99X.W9iWKJjo6";
