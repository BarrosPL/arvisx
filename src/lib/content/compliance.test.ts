import { describe, expect, it } from "vitest";
import { findComplianceViolations } from "./compliance";
import type { GenerationOutput } from "./schema";
import type { Brand } from "@/generated/prisma/client";

function fakeOutput(overrides: Partial<GenerationOutput> = {}): GenerationOutput {
  return {
    archetype: "Informativo",
    hook: "Você sabia?",
    headline: "Conheça o processo de cidadania italiana",
    subheadline: "Assessoria especializada em cada etapa",
    bodyPoints: ["Documentação organizada", "Acompanhamento próximo"],
    cta: "Fale conosco",
    caption: "Texto de legenda neutro sobre o tema.",
    hashtags: ["#CidadaniaItaliana"],
    altText: "Descrição neutra da imagem.",
    ...overrides,
  };
}

function fakeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "brand_1",
    ownerUserId: "user_1",
    name: "Marca Teste",
    slug: "marca-teste",
    logoUrl: null,
    palette: {},
    headingFontId: "inter-bold",
    bodyFontId: "inter-regular",
    voiceTone: null,
    voiceAttributes: [],
    forbiddenTerms: [],
    mandatoryTerms: null,
    industry: null,
    targetAudience: null,
    valueProposition: null,
    contentPillars: [],
    legalDisclaimer: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Brand;
}

describe("findComplianceViolations", () => {
  it("não acusa nada num texto limpo", () => {
    expect(findComplianceViolations(fakeOutput(), fakeBrand())).toEqual([]);
  });

  it("acusa termo proibido da marca, em qualquer campo", () => {
    const output = fakeOutput({ caption: "Aproveite nossa ÚLTIMA CHANCE de resolver seu caso." });
    const brand = fakeBrand({ forbiddenTerms: ["última chance"] });
    const violations = findComplianceViolations(output, brand);
    expect(violations.some((v) => v.includes("última chance"))).toBe(true);
  });

  it("acusa promessa de resultado garantido", () => {
    const output = fakeOutput({ headline: "Cidadania italiana garantida para você" });
    const violations = findComplianceViolations(output, fakeBrand());
    expect(violations.length).toBeGreaterThan(0);
  });

  it("acusa promessa de prazo específico", () => {
    const output = fakeOutput({ subheadline: "Receba sua cidadania em 6 meses" });
    const violations = findComplianceViolations(output, fakeBrand());
    expect(violations.length).toBeGreaterThan(0);
  });

  it("acusa promessa de percentual de aprovação", () => {
    const output = fakeOutput({ bodyPoints: ["100% de aprovação garantida em todos os casos"] });
    const violations = findComplianceViolations(output, fakeBrand());
    expect(violations.length).toBeGreaterThan(0);
  });

  it("não acusa '100%' fora de um padrão de promessa", () => {
    const output = fakeOutput({ caption: "Ficamos 100% disponíveis para tirar suas dúvidas." });
    const violations = findComplianceViolations(output, fakeBrand());
    expect(violations).toEqual([]);
  });
});
