import { afterEach, describe, expect, it } from "vitest";
import { resetAllRateLimits } from "./rateLimit";
import {
  PER_IDENTITY,
  PER_IP,
  checkLoginThrottle,
  loginCredentialsSchema,
  loginKeysFor,
  registerLoginFailure,
  registerLoginSuccess,
} from "./loginPolicy";
import { clientIpFrom } from "./clientIp";

afterEach(() => resetAllRateLimits());

describe("loginKeysFor", () => {
  it("trata a mesma conta com caixa diferente como um balde so", () => {
    const a = loginKeysFor("1.2.3.4", "Renan@Perrottiadv.com");
    const b = loginKeysFor("1.2.3.4", "  renan@perrottiadv.com ");
    expect(a.identity).toBe(b.identity);
  });

  it("separa contas diferentes no mesmo IP", () => {
    expect(loginKeysFor("1.2.3.4", "a@x.com").identity).not.toBe(
      loginKeysFor("1.2.3.4", "b@x.com").identity
    );
  });
});

describe("checkLoginThrottle", () => {
  it("bloqueia a conta depois do limite de tentativas do mesmo IP", () => {
    const keys = loginKeysFor("1.2.3.4", "renan@x.com");
    for (let i = 0; i < PER_IDENTITY.limit; i++) registerLoginFailure(keys);
    expect(checkLoginThrottle(keys).blocked).toBe(true);
  });

  it("nao deixa um atacante de fora trancar a conta de alguem (bloqueio carrega o IP)", () => {
    const atacante = loginKeysFor("9.9.9.9", "renan@x.com");
    for (let i = 0; i < PER_IDENTITY.limit; i++) registerLoginFailure(atacante);
    expect(checkLoginThrottle(atacante).blocked).toBe(true);

    // O Renan, do IP dele, continua conseguindo tentar normalmente.
    expect(checkLoginThrottle(loginKeysFor("1.2.3.4", "renan@x.com")).blocked).toBe(false);
  });

  it("pega password spraying: muitas contas diferentes a partir do mesmo IP", () => {
    // Cada email sozinho fica abaixo do limite por identidade - so a regra por IP pega.
    for (let i = 0; i < PER_IP.limit; i++) {
      registerLoginFailure(loginKeysFor("9.9.9.9", `vitima${i}@x.com`));
    }
    expect(checkLoginThrottle(loginKeysFor("9.9.9.9", "nova@x.com")).blocked).toBe(true);
  });

  it("login certo libera a conta, mas nao zera a cota de varredura do IP", () => {
    const propria = loginKeysFor("9.9.9.9", "atacante@x.com");
    for (let i = 0; i < PER_IP.limit; i++) {
      registerLoginFailure(loginKeysFor("9.9.9.9", `vitima${i}@x.com`));
    }
    registerLoginSuccess(propria);
    expect(checkLoginThrottle(loginKeysFor("9.9.9.9", "outra@x.com")).blocked).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("usa o ultimo valor do X-Forwarded-For, nao o primeiro", () => {
    // O atacante inventa o primeiro valor; o proxy apenda o IP real no fim.
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    expect(clientIpFrom(h)).toBe("203.0.113.7");
  });

  it("nao deixa forjar IP diferente a cada tentativa pra escapar do limite", () => {
    const um = clientIpFrom(new Headers({ "x-forwarded-for": "5.5.5.5, 203.0.113.7" }));
    const dois = clientIpFrom(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }));
    expect(um).toBe(dois);
  });

  it("normaliza IPv4 mapeado em IPv6 e porta pro mesmo balde", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "::ffff:203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe("203.0.113.7");
  });

  it("cai num balde compartilhado quando nao da pra saber o IP (limita demais, nunca de menos)", () => {
    expect(clientIpFrom(new Headers())).toBe("desconhecido");
  });
});

describe("validacao da entrada do login", () => {
  /**
   * Estes payloads sao os classicos de SQL injection. O ponto do teste NAO e que a
   * validacao "limpa" eles - e que eles nunca chegariam a virar SQL de qualquer forma:
   * o Prisma manda `WHERE email = $1` com o valor separado, entao aspas e "--" sao
   * apenas texto. A validacao os rejeita antes disso por um motivo diferente e mais
   * simples: nao sao emails validos.
   */
  const payloadsDeInjecao = [
    "' OR '1'='1",
    "admin'--",
    "'; DROP TABLE \"User\"; --",
    "renan@x.com' OR 1=1 --",
    "' UNION SELECT email, passwordHash FROM \"User\" --",
  ];

  it.each(payloadsDeInjecao)("rejeita o payload de injecao %j", (email) => {
    expect(loginCredentialsSchema.safeParse({ email, password: "x" }).success).toBe(false);
  });

  it("rejeita email absurdamente longo antes de encostar no banco", () => {
    const gigante = "a".repeat(300) + "@x.com";
    expect(loginCredentialsSchema.safeParse({ email: gigante, password: "x" }).success).toBe(false);
  });

  it("rejeita senha gigante (o bcrypt trunca em 72 bytes de qualquer jeito)", () => {
    const senha = "a".repeat(5000);
    expect(loginCredentialsSchema.safeParse({ email: "a@x.com", password: senha }).success).toBe(false);
  });

  it("rejeita campo ausente ou de tipo errado", () => {
    expect(loginCredentialsSchema.safeParse({}).success).toBe(false);
    expect(loginCredentialsSchema.safeParse({ email: 123, password: "x" }).success).toBe(false);
    expect(loginCredentialsSchema.safeParse({ email: "a@x.com", password: "" }).success).toBe(false);
  });

  it("aceita um login normal", () => {
    const ok = loginCredentialsSchema.safeParse({
      email: " renan@perrottiadv.com ",
      password: "uma-senha-qualquer",
    });
    expect(ok.success).toBe(true);
    // O trim limpa espaco colado no email, mas a caixa das letras e preservada: o banco
    // guarda o email como foi cadastrado e normalizar aqui mudaria quem consegue entrar.
    expect(ok.success && ok.data.email).toBe("renan@perrottiadv.com");
  });
});
