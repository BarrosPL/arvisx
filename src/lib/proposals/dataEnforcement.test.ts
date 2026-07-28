import { describe, expect, it } from "vitest";
import { deriveInitialStatus, evaluateProposalReadiness } from "./dataEnforcement";

describe("evaluateProposalReadiness", () => {
  it("marca campanha nova como pronta mesmo sem IDs (é hipótese)", () => {
    const result = evaluateProposalReadiness({
      type: "NEW_CAMPAIGN",
      platformCampaignId: null,
      platformAdId: null,
      metricsJson: null,
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(deriveInitialStatus(result)).toBe("PENDING");
  });

  it("recusa pausar anúncio existente sem campaign_id/ad_id nem métrica", () => {
    const result = evaluateProposalReadiness({
      type: "PAUSE_AD",
      platformCampaignId: null,
      platformAdId: null,
      metricsJson: null,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("campaign_id ou ad_id");
    expect(result.missing).toContain("métrica financeira (spend/ctr/cpc/cpl/cpa/conversions)");
    expect(deriveInitialStatus(result)).toBe("NEEDS_MORE_DATA");
  });

  it("recusa quando tem ID mas nenhuma métrica financeira real", () => {
    const result = evaluateProposalReadiness({
      type: "ADJUST_BUDGET",
      platformCampaignId: "123456789",
      platformAdId: null,
      metricsJson: { note: "sem numero aqui" },
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["métrica financeira (spend/ctr/cpc/cpl/cpa/conversions)"]);
  });

  it("aprova ação em campanha existente com ad_id e métrica reais", () => {
    const result = evaluateProposalReadiness({
      type: "PAUSE_AD",
      platformCampaignId: null,
      platformAdId: "act_987654321",
      metricsJson: { spend: 152.3, ctr: 0.8, conversions: 0 },
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(deriveInitialStatus(result)).toBe("PENDING");
  });
});
