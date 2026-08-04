import { randomBytes } from "crypto";
import { encryptSecret } from "@/lib/crypto";

/** Gera um segredo novo pro HMAC do webhook - o plaintext e devolvido pra UI SO na
 * resposta desta chamada (criacao do form, ou troca da URL), nunca mais depois. */
export function generateWebhookSecret(): { plaintext: string; encrypted: string } {
  const plaintext = randomBytes(32).toString("hex");
  return { plaintext, encrypted: encryptSecret(plaintext) };
}
