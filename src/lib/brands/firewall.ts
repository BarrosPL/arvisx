function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface FirewallBrandInput {
  id: string;
  excludedKeywords: string[];
}

export interface FirewallCheckResult {
  allowed: boolean;
  matchedKeywords: string[];
}

/**
 * Classificador puro do brand firewall: bloqueia conteudo que mencione temas conhecidos
 * de OUTRAS marcas (Brand.excludedKeywords). Sem I/O, sem banco - so texto normalizado
 * contra a lista de palavras-chave, para poder ser testado isoladamente e usado tanto na
 * validacao de entrada (pedido do usuario) quanto de saida (resposta do agente).
 */
export function checkBrandFirewall(brand: FirewallBrandInput, text: string): FirewallCheckResult {
  const normalizedText = normalize(text);
  const matchedKeywords = brand.excludedKeywords.filter((keyword) =>
    normalizedText.includes(normalize(keyword))
  );

  return { allowed: matchedKeywords.length === 0, matchedKeywords };
}

async function logFirewallCheck(
  brandId: string,
  direction: "IN" | "OUT",
  text: string,
  result: FirewallCheckResult
) {
  const { prisma } = await import("@/lib/prisma");
  await prisma.firewallLog.create({
    data: {
      brandId,
      direction,
      contentSnippet: text.slice(0, 500),
      matchedKeywords: result.matchedKeywords,
      decision: result.allowed ? "ALLOW" : "BLOCK",
    },
  });
}

/** Valida uma mensagem recebida (pedido do usuario/gatilho) antes de chamar o modelo. */
export async function validateInbound(brand: FirewallBrandInput, text: string): Promise<FirewallCheckResult> {
  const result = checkBrandFirewall(brand, text);
  await logFirewallCheck(brand.id, "IN", text, result);
  return result;
}

/** Valida a resposta final do agente antes de entrega-la ao usuario. */
export async function validateOutbound(brand: FirewallBrandInput, text: string): Promise<FirewallCheckResult> {
  const result = checkBrandFirewall(brand, text);
  await logFirewallCheck(brand.id, "OUT", text, result);
  return result;
}
