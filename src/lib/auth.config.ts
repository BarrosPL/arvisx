import type { NextAuthConfig } from "next-auth";

/**
 * Configuracao "edge-safe" do Auth.js: sem providers/Prisma/bcrypt, usada pelo middleware
 * (que roda no Edge Runtime e nao pode importar o driver Postgres). O src/lib/auth.ts
 * completa essa config com o Credentials provider para uso em route handlers/server actions.
 */
/**
 * Em producao o NEXTAUTH_URL e o dominio https do EasyPanel; em dev e http://localhost.
 * Derivar o `secure` dai (em vez de NODE_ENV) e o mesmo criterio que o proprio Auth.js
 * usa por padrao - entao fixar isto explicitamente NAO muda o nome do cookie nem desloga
 * ninguem, so tira a configuracao do campo do "default implicito".
 */
const authUrl = process.env.NEXTAUTH_URL;
const useSecureCookies = authUrl
  ? authUrl.startsWith("https://")
  : // Sem NEXTAUTH_URL configurada, o criterio vira o ambiente. Este fallback existe pra
    // nunca REBAIXAR producao: se a variavel sumisse, cair em `false` entregaria um
    // cookie sem a flag Secure num ambiente que hoje tem ela.
    process.env.NODE_ENV === "production";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [],
  /**
   * O token de sessao e um JWT criptografado (JWE) e vive SO num cookie httpOnly - o
   * JavaScript da pagina nao consegue ler, nem por document.cookie nem via XSS. Estas
   * opcoes ja eram o default do Auth.js; ficam escritas aqui pra que uma mudanca de
   * default numa versao futura (a v5 ainda esta em beta) nao afrouxe isso em silencio.
   *
   * sameSite "lax" e o certo aqui: "strict" quebraria a volta do OAuth de Meta/Google,
   * porque o navegador nao mandaria o cookie na navegacao vinda do dominio deles.
   */
  cookies: {
    sessionToken: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAuthPage = nextUrl.pathname.startsWith("/login");

      if (nextUrl.pathname.startsWith("/api")) {
        // Rotas de API fazem sua propria checagem via requireUser()/requireBrandAccess().
        return true;
      }

      if (isOnAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
