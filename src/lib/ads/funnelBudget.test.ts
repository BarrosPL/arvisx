import { describe, expect, it } from "vitest";
import {
  distributeFunnelBudget,
  validateFunnelBudget,
  FUNNEL_LAYER_BUDGET_SHARE,
  FUNNEL_LAYER_ORDER,
  MIN_LAYER_DAILY_BUDGET,
} from "./funnelBudget";

describe("FUNNEL_LAYER_BUDGET_SHARE", () => {
  it("as fatias somam exatamente 1 (nada de orcamento sumindo ou sobrando)", () => {
    const total = Object.values(FUNNEL_LAYER_BUDGET_SHARE).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("distributeFunnelBudget", () => {
  it("divide o total nas 5 camadas, na ordem fixa", () => {
    const layers = distributeFunnelBudget(100);
    expect(layers.map((l) => l.layerKey)).toEqual(FUNNEL_LAYER_ORDER);
    expect(layers.find((l) => l.layerKey === "FRIO")?.dailyBudget).toBeCloseTo(35, 5);
    expect(layers.find((l) => l.layerKey === "MORNO")?.dailyBudget).toBeCloseTo(20, 5);
    expect(layers.find((l) => l.layerKey === "REMARKETING")?.dailyBudget).toBeCloseTo(10, 5);
  });

  it("a soma das fatias fica proxima do total (arredondamento de centavo, nunca mais)", () => {
    const layers = distributeFunnelBudget(73.33);
    const sum = layers.reduce((a, l) => a + l.dailyBudget, 0);
    expect(Math.abs(sum - 73.33)).toBeLessThan(0.05);
  });
});

describe("validateFunnelBudget", () => {
  it("orcamento confortavel passa sem nenhuma camada abaixo do piso", () => {
    const result = validateFunnelBudget(200);
    expect(result.ok).toBe(true);
    expect(result.layersBelowMinimum).toHaveLength(0);
  });

  it("orcamento pequeno demais reprova - REMARKETING (a menor fatia) e a primeira a furar o piso", () => {
    const result = validateFunnelBudget(30); // REMARKETING = 10% de 30 = 3, abaixo do piso de 5
    expect(result.ok).toBe(false);
    expect(result.layersBelowMinimum.map((l) => l.layerKey)).toContain("REMARKETING");
  });

  it("sugere um total minimo que, aplicado, realmente passa na validacao (nao e um numero solto)", () => {
    const { suggestedMinimumTotal } = validateFunnelBudget(30);
    expect(validateFunnelBudget(suggestedMinimumTotal).ok).toBe(true);
  });

  it(`MIN_LAYER_DAILY_BUDGET (${MIN_LAYER_DAILY_BUDGET}) e o que a menor fatia bate no total sugerido`, () => {
    const { suggestedMinimumTotal } = validateFunnelBudget(1);
    const layers = distributeFunnelBudget(suggestedMinimumTotal);
    const smallest = Math.min(...layers.map((l) => l.dailyBudget));
    expect(smallest).toBeGreaterThanOrEqual(MIN_LAYER_DAILY_BUDGET - 0.5);
  });
});
