import { createHash } from "crypto";

/**
 * Hash unidirecional de IP (nunca criptografia reversivel - nem o admin recupera o IP
 * original) - usado em Lead.ipHash e BioEvent.sessionHash, requisito RGPD explicito
 * (F7.4: "IP hasheado, nunca em claro"). IP_HASH_PEPPER e separada de
 * CREDENTIALS_ENC_KEY de proposito (papeis diferentes: uma e chave simetrica
 * reversivel, a outra e so um pepper de hash).
 */
export function hashIp(ip: string): string {
  const pepper = process.env.IP_HASH_PEPPER;
  if (!pepper) {
    throw new Error("IP_HASH_PEPPER não configurada");
  }
  return createHash("sha256").update(`${ip}:${pepper}`).digest("hex");
}
