import { checkRateLimit, registerFailure, type RateLimitRule } from "@/lib/security/rateLimit";

/**
 * Rate limit de submissao de formulario publico - mesmo formato de loginPolicy.ts, mas
 * com uma inversao deliberada: no login so a FALHA conta contra a cota (tentativa
 * errada), aqui e o SUCESSO que conta (um bot mandando o mesmo formulario repetidas
 * vezes "com sucesso" e exatamente o que precisa ser contido - errar validacao nao
 * consome cota de ninguem). Duas regras, mesmo motivo de duas no login: por IP (alguem
 * varrendo o formulario de um so lugar) e por formulario (varredura distribuida contra
 * UM formulario especifico).
 */
const PER_IP: RateLimitRule = { limit: 5, windowMs: 10 * 60 * 1000 };
const PER_FORM: RateLimitRule = { limit: 100, windowMs: 10 * 60 * 1000 };

export interface FormSubmitKeys {
  readonly ip: string;
  readonly form: string;
}

export function formSubmitKeysFor(ip: string, leadFormId: string): FormSubmitKeys {
  return { ip: `formsubmit:ip:${ip}`, form: `formsubmit:form:${leadFormId}` };
}

export interface FormSubmitThrottleVerdict {
  readonly blocked: boolean;
  readonly retryAfterSeconds: number;
}

export function checkFormSubmitThrottle(keys: FormSubmitKeys): FormSubmitThrottleVerdict {
  const ip = checkRateLimit(keys.ip, PER_IP);
  const form = checkRateLimit(keys.form, PER_FORM);
  if (!ip.blocked && !form.blocked) return { blocked: false, retryAfterSeconds: 0 };
  return { blocked: true, retryAfterSeconds: Math.max(ip.retryAfterSeconds, form.retryAfterSeconds) };
}

/** Chamado em todo envio VALIDO (que passou honeypot+campos+consent), nao so em falha -
 * ver comentario no topo do arquivo. */
export function registerFormSubmit(keys: FormSubmitKeys): void {
  registerFailure(keys.ip, PER_IP);
  registerFailure(keys.form, PER_FORM);
}
