import { describe, expect, it, beforeEach } from "vitest";
import { recordMetaThrottle, checkMetaThrottle, resetMetaThrottleForTests } from "./metaThrottle";

function responseWithThrottle(payload: unknown): Response {
  return new Response(null, {
    headers: payload === null ? {} : { "x-fb-ads-insights-throttle": JSON.stringify(payload) },
  });
}

describe("metaThrottle", () => {
  beforeEach(() => resetMetaThrottleForTests());

  it("libera quando a utilização está baixa", () => {
    recordMetaThrottle(responseWithThrottle({ app_id_util_pct: 10, acc_id_util_pct: 5 }), "act_1");
    expect(checkMetaThrottle("act_1").backOff).toBe(false);
  });

  it("segura a conta que passou de 80%", () => {
    recordMetaThrottle(responseWithThrottle({ app_id_util_pct: 10, acc_id_util_pct: 85 }), "act_1");
    const decision = checkMetaThrottle("act_1");
    expect(decision.backOff).toBe(true);
    expect(decision.appLevel).toBeFalsy();
    expect(decision.reason).toContain("85");
  });

  it("conta estourada não afeta as outras contas", () => {
    recordMetaThrottle(responseWithThrottle({ app_id_util_pct: 10, acc_id_util_pct: 95 }), "act_1");
    expect(checkMetaThrottle("act_1").backOff).toBe(true);
    expect(checkMetaThrottle("act_2").backOff).toBe(false);
  });

  it("cota do APP estourada para TODAS as contas (a cota é compartilhada)", () => {
    recordMetaThrottle(responseWithThrottle({ app_id_util_pct: 92, acc_id_util_pct: 1 }), "act_1");
    const other = checkMetaThrottle("act_qualquer_outra");
    expect(other.backOff).toBe(true);
    expect(other.appLevel).toBe(true);
  });

  it("cabeçalho ausente ou inválido não bloqueia nada (é ausência de informação, não erro)", () => {
    recordMetaThrottle(responseWithThrottle(null), "act_1");
    expect(checkMetaThrottle("act_1").backOff).toBe(false);

    const broken = new Response(null, { headers: { "x-fb-ads-insights-throttle": "isso não é json" } });
    expect(() => recordMetaThrottle(broken, "act_1")).not.toThrow();
    expect(checkMetaThrottle("act_1").backOff).toBe(false);
  });

  it("exatamente 80% já segura (o limite é inclusivo)", () => {
    recordMetaThrottle(responseWithThrottle({ acc_id_util_pct: 80 }), "act_1");
    expect(checkMetaThrottle("act_1").backOff).toBe(true);
  });
});
