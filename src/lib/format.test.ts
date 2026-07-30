import { describe, expect, it } from "vitest";
import { formatCurrency, formatDateTime, formatDate, formatTime, formatRelativeTime, formatNumber } from "./format";

describe("formatRelativeTime", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("mostra 'agora' pra menos de um minuto", () => {
    expect(formatRelativeTime(new Date("2026-01-01T11:59:30.000Z"), now)).toBe("agora");
  });

  it("mostra minutos, horas e dias conforme a distância", () => {
    expect(formatRelativeTime(new Date("2026-01-01T11:47:00.000Z"), now)).toBe("há 13 min");
    expect(formatRelativeTime(new Date("2026-01-01T09:00:00.000Z"), now)).toBe("há 3h");
    expect(formatRelativeTime(new Date("2025-12-30T12:00:00.000Z"), now)).toBe("há 2d");
  });
});

describe("formatNumber", () => {
  it("usa separador de milhar brasileiro e não mostra decimal", () => {
    expect(formatNumber(94000)).toBe("94.000");
    expect(formatNumber(1234.7)).toBe("1.235");
  });
});

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
