import { createHash } from "crypto";

/**
 * sessionHash de BioEvent - sha256(ip+userAgent+dia+pepper), SEMPRE calculado no
 * servidor (nunca aceito do cliente, ver rota /api/public/events). Inclui o dia
 * civil (UTC) de proposito: agrupa cliques da MESMA visita sem virar um identificador
 * estavel entre dias, que se aproximaria de tracking de longo prazo (o que RGPD/F7.4
 * quer evitar).
 */
export function computeSessionHash(ip: string, userAgent: string): string {
  const pepper = process.env.IP_HASH_PEPPER;
  if (!pepper) {
    throw new Error("IP_HASH_PEPPER não configurada");
  }
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}:${userAgent}:${day}:${pepper}`).digest("hex");
}

export function detectDevice(userAgent: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(userAgent)) return "mobile";
  return "desktop";
}
