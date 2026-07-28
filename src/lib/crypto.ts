import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENC_KEY;
  if (!raw) {
    throw new Error("CREDENTIALS_ENC_KEY nao configurada");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENC_KEY precisa decodificar para 32 bytes (AES-256)");
  }
  return key;
}

/** Criptografa um segredo (token/refresh token) num blob unico auto-contido (iv+ciphertext+tag em base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

/** Descriptografa um segredo armazenado. Lança erro se a tag de autenticacao nao bater. */
export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(raw.length - AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH, raw.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
