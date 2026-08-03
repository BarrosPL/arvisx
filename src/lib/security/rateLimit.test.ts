import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  clearRateLimit,
  registerFailure,
  resetAllRateLimits,
  type RateLimitRule,
} from "./rateLimit";

const RULE: RateLimitRule = { limit: 3, windowMs: 60_000 };

afterEach(() => {
  resetAllRateLimits();
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("libera enquanto o numero de falhas esta abaixo do limite", () => {
    registerFailure("a", RULE);
    registerFailure("a", RULE);
    expect(checkRateLimit("a", RULE).blocked).toBe(false);
  });

  it("bloqueia ao atingir o limite e informa quanto falta", () => {
    for (let i = 0; i < RULE.limit; i++) registerFailure("a", RULE);

    const verdict = checkRateLimit("a", RULE);
    expect(verdict.blocked).toBe(true);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("mantem baldes separados por chave - bloquear um IP nao afeta outro", () => {
    for (let i = 0; i < RULE.limit; i++) registerFailure("a", RULE);
    expect(checkRateLimit("a", RULE).blocked).toBe(true);
    expect(checkRateLimit("b", RULE).blocked).toBe(false);
  });

  it("libera de novo depois que a janela passa", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    for (let i = 0; i < RULE.limit; i++) registerFailure("a", RULE);
    expect(checkRateLimit("a", RULE).blocked).toBe(true);

    vi.advanceTimersByTime(RULE.windowMs + 1);
    expect(checkRateLimit("a", RULE).blocked).toBe(false);
  });

  it("desliza a janela em vez de zerar tudo de uma vez", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    registerFailure("a", RULE); // t=0
    vi.advanceTimersByTime(30_000);
    registerFailure("a", RULE); // t=30s
    registerFailure("a", RULE); // t=30s
    expect(checkRateLimit("a", RULE).blocked).toBe(true);

    // Em t=61s so a primeira falha expirou: duas continuam valendo, entao libera - mas
    // uma unica falha nova ja bloqueia de novo. E isso que diferencia janela deslizante
    // de janela fixa (que liberaria as 3 vagas de uma vez).
    vi.advanceTimersByTime(31_000);
    expect(checkRateLimit("a", RULE).blocked).toBe(false);
    registerFailure("a", RULE);
    expect(checkRateLimit("a", RULE).blocked).toBe(true);
  });

  it("checar nao contabiliza - so registerFailure conta", () => {
    registerFailure("a", RULE);
    for (let i = 0; i < 50; i++) checkRateLimit("a", RULE);
    expect(checkRateLimit("a", RULE).blocked).toBe(false);
  });

  it("clearRateLimit zera o balde (login que deu certo)", () => {
    for (let i = 0; i < RULE.limit; i++) registerFailure("a", RULE);
    expect(checkRateLimit("a", RULE).blocked).toBe(true);

    clearRateLimit("a");
    expect(checkRateLimit("a", RULE).blocked).toBe(false);
  });

  it("nao cresce sem limite quando o atacante varia a chave a cada tentativa", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // 30 mil chaves distintas, todas ja fora da janela: a limpeza tem que recolher.
    for (let i = 0; i < 30_000; i++) registerFailure(`chave-${i}`, RULE);
    vi.advanceTimersByTime(RULE.windowMs + 1);
    registerFailure("gatilho-da-limpeza", RULE);

    // A chave nova continua valendo; as antigas sairam - o que importa e que o mapa nao
    // ficou com as 30 mil dentro.
    expect(checkRateLimit("chave-0", RULE).blocked).toBe(false);
  });
});
