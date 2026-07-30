import { describe, expect, it } from "vitest";
import { formatCurrency, formatDateTime, formatDate, formatTime } from "./format";

describe("formatCurrency", () => {
  it("formata em reais (BRL), não em euros", () => {
    const result = formatCurrency(12);
    expect(result).toContain("R$");
    expect(result).not.toContain("€");
  });
});

describe("formatDateTime/formatDate/formatTime", () => {
  // 2026-01-01 15:00 UTC = 12:00 em America/Sao_Paulo (UTC-3, sem horário de verão hoje em dia)
  const utcDate = new Date("2026-01-01T15:00:00.000Z");

  it("converte pro horário de Brasília, não usa o fuso do processo", () => {
    expect(formatTime(utcDate, { hour: "2-digit", minute: "2-digit" })).toBe("12:00");
  });

  it("formatDateTime inclui a hora já convertida", () => {
    expect(formatDateTime(utcDate)).toContain("12:00");
  });

  it("formatDate não quebra em torno da virada do dia (UTC e America/Sao_Paulo podem cair em dias diferentes)", () => {
    const lateUtc = new Date("2026-01-01T01:00:00.000Z"); // 2025-12-31 22:00 em SP
    expect(formatDate(lateUtc)).toBe("31/12/2025");
  });
});
