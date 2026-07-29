import { randomInt } from "crypto";

// Sem 0/O/1/l/I - caracteres ambiguos que atrapalham quem tem que digitar/repassar a senha.
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Senha temporaria gerada para uma conta nova/resetada - sempre acompanhada de mustChangePassword: true. */
export function generateTempPassword(length = 14): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[randomInt(CHARSET.length)];
  }
  return out;
}
