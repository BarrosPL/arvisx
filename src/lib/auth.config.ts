import type { NextAuthConfig } from "next-auth";

/**
 * Configuracao "edge-safe" do Auth.js: sem providers/Prisma/bcrypt, usada pelo middleware
 * (que roda no Edge Runtime e nao pode importar o driver Postgres). O src/lib/auth.ts
 * completa essa config com o Credentials provider para uso em route handlers/server actions.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [],
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
