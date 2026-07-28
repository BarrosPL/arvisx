import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  userId: string;
  nonce: string;
  issuedAt: number;
}

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET nao configurada");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

/** Gera o parametro `state` assinado (integridade, nao sigilo) usado no primeiro leg do OAuth. */
export function signOAuthState(userId: string): string {
  const payload: OAuthStatePayload = {
    userId,
    nonce: randomBytes(12).toString("base64url"),
    issuedAt: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);
  return `${body}.${signature}`;
}

/** Verifica o `state` recebido no callback: assinatura e expiracao. */
export function verifyOAuthState(token: string): OAuthStatePayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    throw new Error("state OAuth malformado");
  }

  const expectedSignature = sign(body);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("state OAuth com assinatura invalida");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
    throw new Error("state OAuth expirado");
  }

  return payload;
}
