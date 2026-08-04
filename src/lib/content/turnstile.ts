const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * TURNSTILE_DISABLED=true e um bypass SO de dev/test (documentado no .env.example) -
 * libera o resto do trabalho (schema ate analytics) sem esperar o Renan criar a conta
 * gratuita no Cloudflare. Em producao, sem TURNSTILE_SECRET_KEY configurada, falha
 * FECHADO (rejeita o submit) - nunca aceita silenciosamente so porque a chave nao esta
 * la, que seria o mesmo que nao ter anti-spam nenhum sem avisar ninguem.
 */
export async function verifyTurnstileToken(token: string | undefined, ip: string): Promise<TurnstileVerdict> {
  if (process.env.TURNSTILE_DISABLED === "true") {
    return { ok: true };
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return { ok: false, reason: "Turnstile não configurado" };
  }
  if (!token) {
    return { ok: false, reason: "Token de verificação ausente" };
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secretKey, response: token, remoteip: ip }),
    });
    const body = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!body.success) {
      return { ok: false, reason: body["error-codes"]?.join(", ") ?? "Verificação falhou" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Erro ao verificar" };
  }
}
