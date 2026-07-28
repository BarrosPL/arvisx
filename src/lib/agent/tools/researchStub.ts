import type { ResearchStubArgs } from "@/lib/agent/schema";

/**
 * Stub explicito de research_market/scan_competitors: nao ha fonte de dado ao vivo
 * configurada nesta fase. Retorna isso de forma clara em vez de deixar o modelo
 * inventar dado de mercado como se fosse real (ver plano da Fase 3).
 */
export async function researchStub(args: ResearchStubArgs) {
  return {
    ok: false,
    query: args.query,
    message: "sem fonte de dado ao vivo configurada",
  };
}
