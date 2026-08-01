import { describe, expect, it } from "vitest";
import {
  campaignPlanSchema,
  proposalPayloadSchema,
  resolveProposalChatArgsSchema,
  adjustProposalChatArgsSchema,
  confirmAndExecuteActionChatArgsSchema,
  getProposalChatArgsSchema,
} from "./schema";

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

describe("tools de decisão/execução (chat)", () => {
  const accountId = "account_1";
  const proposalId = "prop_1";

  it("get_proposal exige accountId e proposalId", () => {
    expect(getProposalChatArgsSchema.safeParse({ accountId, proposalId }).success).toBe(true);
    expect(getProposalChatArgsSchema.safeParse({ accountId }).success).toBe(false);
  });

  it("resolve_proposal aceita approve/test sem note", () => {
    expect(resolveProposalChatArgsSchema.safeParse({ accountId, proposalId, decision: "approve" }).success).toBe(true);
    expect(resolveProposalChatArgsSchema.safeParse({ accountId, proposalId, decision: "test" }).success).toBe(true);
  });

  it("resolve_proposal recusa reject sem note", () => {
    const result = resolveProposalChatArgsSchema.safeParse({ accountId, proposalId, decision: "reject" });
    expect(result.success).toBe(false);
  });

  it("resolve_proposal aceita reject com note", () => {
    const result = resolveProposalChatArgsSchema.safeParse({
      accountId,
      proposalId,
      decision: "reject",
      note: "CPL muito alto pro histórico da marca",
    });
    expect(result.success).toBe(true);
  });

  it("resolve_proposal recusa decision fora do enum (ex: adjust, que agora é tool separada)", () => {
    const result = resolveProposalChatArgsSchema.safeParse({ accountId, proposalId, decision: "adjust" });
    expect(result.success).toBe(false);
  });

  it("adjust_proposal exige note mesmo sem mudar nenhum campo", () => {
    expect(adjustProposalChatArgsSchema.safeParse({ accountId, proposalId, note: "Reduzindo a verba pedida" }).success).toBe(
      true
    );
    expect(adjustProposalChatArgsSchema.safeParse({ accountId, proposalId }).success).toBe(false);
  });

  it("confirm_and_execute_action exige o payload completo da proposta (mesmo formato de propose_action) mais accountId", () => {
    expect(confirmAndExecuteActionChatArgsSchema.safeParse({ accountId, proposalId }).success).toBe(false);
    const fullPayload = {
      accountId,
      type: "PAUSE_AD" as const,
      title: "Pausar anúncio com CPL alto",
      reason: "CPL 40% acima da média das últimas coletas",
      metricsJson: { cpl: 25 },
      suggestedAction: "Pausar o anúncio até revisar o criativo",
      risk: "Perda de alcance temporária",
      rollbackPlan: "Reativar o anúncio a qualquer momento",
      platform: "META" as const,
      platformCampaignId: "camp_1",
      platformAdId: "ad_1",
      platformAdSetId: "adset_1",
    };
    expect(confirmAndExecuteActionChatArgsSchema.safeParse(fullPayload).success).toBe(true);
  });
});
