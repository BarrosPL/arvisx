import { describe, expect, it } from "vitest";
import { campaignPlanSchema, proposalPayloadSchema } from "./schema";

const basePlan = {
  campaignName: "Campanha de teste",
  dailyBudget: 20,
  headline: "Título de teste",
  primaryText: "Texto principal de teste com mais de dez caracteres",
  description: "Descrição de teste",
  callToAction: "LEARN_MORE" as const,
  finalUrl: "https://example.com",
};

const metaTargeting = { countries: ["BR"], ageMin: 25, ageMax: 45, interests: ["cidadania italiana"] };
const googleKeywords = [
  { text: "cidadania italiana", matchType: "BROAD" as const },
  { text: "advogado imigração", matchType: "PHRASE" as const },
  { text: "visto europeu", matchType: "EXACT" as const },
];
const googleAd = {
  headlines: ["Headline 1", "Headline 2", "Headline 3"],
  descriptions: ["Description 1", "Description 2"],
};

describe("campaignPlanSchema", () => {
  it("aceita um plano válido para o Meta (metaTargeting)", () => {
    const result = campaignPlanSchema.safeParse({ ...basePlan, metaTargeting });
    expect(result.success).toBe(true);
  });

  it("aceita um plano válido para o Google (googleKeywords + googleAd)", () => {
    const result = campaignPlanSchema.safeParse({ ...basePlan, googleKeywords, googleAd });
    expect(result.success).toBe(true);
  });

  it("recusa um plano sem metaTargeting nem googleKeywords", () => {
    const result = campaignPlanSchema.safeParse(basePlan);
    expect(result.success).toBe(false);
  });

  it("recusa googleKeywords sem googleAd (Responsive Search Ad precisa de headlines/descriptions)", () => {
    const result = campaignPlanSchema.safeParse({ ...basePlan, googleKeywords });
    expect(result.success).toBe(false);
  });

  it("recusa googleAd com menos de 3 headlines", () => {
    const result = campaignPlanSchema.safeParse({
      ...basePlan,
      googleKeywords,
      googleAd: { headlines: ["Só uma", "Duas"], descriptions: googleAd.descriptions },
    });
    expect(result.success).toBe(false);
  });

  it("recusa googleAd com menos de 2 descriptions", () => {
    const result = campaignPlanSchema.safeParse({
      ...basePlan,
      googleKeywords,
      googleAd: { headlines: googleAd.headlines, descriptions: ["Só uma"] },
    });
    expect(result.success).toBe(false);
  });

  it("recusa callToAction fora da lista de tipos aceitos pela Graph API do Meta", () => {
    const result = campaignPlanSchema.safeParse({ ...basePlan, callToAction: "SAIBA_MAIS", metaTargeting });
    expect(result.success).toBe(false);
  });
});

describe("proposalPayloadSchema — NEW_CAMPAIGN", () => {
  const basePayload = {
    type: "NEW_CAMPAIGN" as const,
    title: "Nova campanha de teste",
    reason: "Hipótese de mercado com mais de dez caracteres",
    metricsJson: {},
    suggestedAction: "Lançar campanha nova",
    risk: "Gasto sem histórico prévio",
    rollbackPlan: "Pausar a campanha se performar mal",
    platform: "META" as const,
    platformCampaignId: null,
    platformAdId: null,
    platformAdSetId: null,
  };

  it("recusa NEW_CAMPAIGN sem campaignPlan", () => {
    const result = proposalPayloadSchema.safeParse(basePayload);
    expect(result.success).toBe(false);
  });

  it("aceita NEW_CAMPAIGN com campaignPlan completo do Meta", () => {
    const result = proposalPayloadSchema.safeParse({
      ...basePayload,
      campaignPlan: { ...basePlan, metaTargeting },
    });
    expect(result.success).toBe(true);
  });

  it("aceita NEW_CAMPAIGN com campaignPlan completo do Google", () => {
    const result = proposalPayloadSchema.safeParse({
      ...basePayload,
      platform: "GOOGLE",
      campaignPlan: { ...basePlan, googleKeywords, googleAd },
    });
    expect(result.success).toBe(true);
  });
});
