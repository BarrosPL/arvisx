import { describe, expect, it } from "vitest";
import { checkBrandFirewall } from "./firewall";
import { BRAND_REGISTRY } from "./registry";

function brandBySlug(slug: string) {
  const brand = BRAND_REGISTRY.find((b) => b.slug === slug);
  if (!brand) throw new Error(`marca de teste não encontrada: ${slug}`);
  return { id: brand.slug, excludedKeywords: brand.excludedKeywords };
}

describe("checkBrandFirewall", () => {
  it("bloqueia VNE falando de curso/mentoria (território da RENAN)", () => {
    const vne = brandBySlug("vne");
    const result = checkBrandFirewall(vne, "Vamos lançar uma mentoria e um curso novo esse mês");
    expect(result.allowed).toBe(false);
    expect(result.matchedKeywords).toContain("mentoria");
    expect(result.matchedKeywords).toContain("curso");
  });

  it("bloqueia VNE falando de hotmart/kiwify (território da RENAN)", () => {
    const vne = brandBySlug("vne");
    const result = checkBrandFirewall(vne, "Precisamos configurar o checkout na Hotmart");
    expect(result.allowed).toBe(false);
    expect(result.matchedKeywords).toContain("hotmart");
  });

  it("permite VNE falando do próprio tema (cidadania)", () => {
    const vne = brandBySlug("vne");
    const result = checkBrandFirewall(vne, "Como está a campanha de cidadania italiana essa semana?");
    expect(result.allowed).toBe(true);
    expect(result.matchedKeywords).toHaveLength(0);
  });

  it("bloqueia RENAN falando de cidadania (território da VNE)", () => {
    const renan = brandBySlug("renan");
    const result = checkBrandFirewall(renan, "Precisamos escalar a campanha de cidadania portuguesa");
    expect(result.allowed).toBe(false);
    expect(result.matchedKeywords).toContain("cidadania portuguesa");
  });

  it("ignora acentuação e caixa ao comparar (case/accent-insensitive)", () => {
    const vne = brandBySlug("vne");
    const result = checkBrandFirewall(vne, "MENTORIA e CURSO em destaque, com HOTMART configurado");
    expect(result.allowed).toBe(false);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("não bloqueia quando o texto está vazio", () => {
    const vne = brandBySlug("vne");
    const result = checkBrandFirewall(vne, "");
    expect(result.allowed).toBe(true);
  });
});
