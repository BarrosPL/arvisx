import { describe, expect, it } from "vitest";
import { resolveResultMetric } from "./resultMetric";

describe("resolveResultMetric", () => {
  it("campanha de lead conta o lead, não a soma de lead + pixel (fim da contagem dobrada)", () => {
    // Este é exatamente o bug da contagem antiga: os dois eventos reportam o MESMO
    // lead, e a lista fixa somava os dois, mostrando 20 onde o Gerenciador mostra 10.
    const actions = [
      { action_type: "lead", value: "10" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "10" },
      { action_type: "link_click", value: "350" },
    ];
    const result = resolveResultMetric(actions, "OUTCOME_LEADS");
    expect(result.value).toBe(10);
    expect(result.resultType).toBe("lead");
    expect(result.usedFallback).toBe(false);
  });

  it("campanha de tráfego conta clique no link (antes dava 0)", () => {
    const actions = [
      { action_type: "link_click", value: "428" },
      { action_type: "post_engagement", value: "512" },
    ];
    const result = resolveResultMetric(actions, "OUTCOME_TRAFFIC");
    expect(result.value).toBe(428);
    expect(result.resultType).toBe("link_click");
  });

  it("campanha de engajamento conta conversa iniciada (antes dava 0 pra vários tipos)", () => {
    const actions = [
      { action_type: "post_engagement", value: "90" },
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "17" },
    ];
    const result = resolveResultMetric(actions, "OUTCOME_ENGAGEMENT");
    expect(result.value).toBe(17);
    expect(result.resultType).toBe("onsite_conversion.messaging_conversation_started_7d");
  });

  it("objetivo desconhecido usa fallback e marca isso explicitamente", () => {
    const actions = [
      { action_type: "link_click", value: "40" },
      { action_type: "lead", value: "6" },
    ];
    const result = resolveResultMetric(actions, "OBJETIVO_QUE_NAO_EXISTE");
    expect(result.value).toBe(6);
    expect(result.resultType).toBe("lead");
    expect(result.usedFallback).toBe(true);
  });

  it("objetivo ausente (null) também usa fallback, sem quebrar", () => {
    const result = resolveResultMetric([{ action_type: "purchase", value: "3" }], null);
    expect(result.value).toBe(3);
    expect(result.resultType).toBe("purchase");
    expect(result.usedFallback).toBe(true);
  });

  it("sem actions devolve zero sem inventar tipo", () => {
    expect(resolveResultMetric(undefined, "OUTCOME_LEADS")).toEqual({
      value: 0,
      resultType: null,
      usedFallback: false,
    });
    expect(resolveResultMetric([], "OUTCOME_LEADS")).toEqual({
      value: 0,
      resultType: null,
      usedFallback: false,
    });
  });

  it("campanha cujo objetivo não teve nenhuma ação correspondente devolve zero, não um número de outro tipo", () => {
    // Campanha de vendas que só teve clique - não pode reportar clique como "venda".
    const actions = [{ action_type: "link_click", value: "500" }];
    const result = resolveResultMetric(actions, "OUTCOME_SALES");
    expect(result.value).toBe(0);
    expect(result.resultType).toBe(null);
  });

  it("aceita objetivo legado (campanhas antigas) igual ao novo", () => {
    const actions = [{ action_type: "lead", value: "8" }];
    expect(resolveResultMetric(actions, "LEAD_GENERATION").value).toBe(8);
    expect(resolveResultMetric(actions, "LEAD_GENERATION").usedFallback).toBe(false);
  });

  it("é indiferente a maiúscula/minúscula no objetivo", () => {
    const actions = [{ action_type: "lead", value: "5" }];
    expect(resolveResultMetric(actions, "outcome_leads").value).toBe(5);
    expect(resolveResultMetric(actions, "outcome_leads").usedFallback).toBe(false);
  });

  it("aceita value numérico além de string (Google manda número)", () => {
    const actions = [{ action_type: "lead", value: 12 }];
    expect(resolveResultMetric(actions, "OUTCOME_LEADS").value).toBe(12);
  });
});
