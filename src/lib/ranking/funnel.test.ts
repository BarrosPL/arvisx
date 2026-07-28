import { describe, expect, it } from "vitest";
import { classifyFunnelStage } from "./funnel";

describe("classifyFunnelStage", () => {
  it("classifica campanha com nomenclatura real do Renan como fundo (quente tem prioridade)", () => {
    expect(classifyFunnelStage("[MORNO E QUENTE] [SC] [MENSAGEM] - CIDADANIA ITALIANA")).toBe("FUNDO");
  });

  it("classifica campanha de prospecção como topo", () => {
    expect(classifyFunnelStage("[FRIO] [PROSPECCAO] - NOVOS PUBLICOS")).toBe("TOPO");
  });

  it("classifica campanha de remarketing como fundo", () => {
    expect(classifyFunnelStage("Remarketing - carrinho abandonado")).toBe("FUNDO");
  });

  it("classifica campanha morna como meio", () => {
    expect(classifyFunnelStage("Campanha MORNO - engajamento")).toBe("MEIO");
  });

  it("retorna null quando o nome nao bate com nenhuma palavra-chave", () => {
    expect(classifyFunnelStage("Campanha sem padrao nenhum")).toBeNull();
  });

  it("retorna null quando o nome da campanha e null", () => {
    expect(classifyFunnelStage(null)).toBeNull();
  });

  it("ignora acentuacao e caixa", () => {
    expect(classifyFunnelStage("CONVERSÃO - Público quente")).toBe("FUNDO");
  });
});
