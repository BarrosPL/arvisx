import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { clientIpFrom } from "@/lib/security/clientIp";
import {
  DUMMY_PASSWORD_HASH,
  checkLoginThrottle,
  loginCredentialsSchema,
  loginKeysFor,
  registerLoginFailure,
  registerLoginSuccess,
} from "@/lib/security/loginPolicy";

/**
 * Erro distinto do "senha errada" so pro caso de bloqueio.
 *
 * Sem isto, quem tomou o bloqueio veria "Email ou senha invalidos" e ficaria tentando
 * senha nova achando que errou - o que so estica o bloqueio. Contar que o limite estourou
 * nao entrega nada sobre conta nenhuma: o atacante ja sabe quantas vezes tentou.
 */
export class LoginRateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      /**
       * O rate limit mora AQUI, e nao na server action do formulario, porque este e o
       * unico ponto por onde os dois caminhos passam: o formulario e um POST direto em
       * /api/auth/callback/credentials. Limitar so a action deixaria a porta dos fundos
       * escancarada justamente pra quem esta scriptando o ataque.
       */
      authorize: async (credentials, request) => {
        const parsed = loginCredentialsSchema.safeParse(credentials);
        const ip = clientIpFrom(request.headers);

        // Entrada malformada nem chega no banco. Ainda assim conta como falha: mandar
        // lixo em rajada tambem e ataque, e sem contabilizar isso seria de graca.
        if (!parsed.success) {
          const raw = typeof credentials?.email === "string" ? credentials.email.slice(0, 254) : "";
          registerLoginFailure(loginKeysFor(ip, raw));
          return null;
        }

        const { email, password } = parsed.data;
        const keys = loginKeysFor(ip, email);

        const throttle = checkLoginThrottle(keys);
        if (throttle.blocked) {
          console.warn(
            `[login] bloqueado por rate limit: ip=${ip} tentar novamente em ${throttle.retryAfterSeconds}s`
          );
          // Tentativa bloqueada nao vira registro novo (ver comentario em checkRateLimit).
          throw new LoginRateLimitedError();
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Comparar SEMPRE, mesmo sem usuario, pra que o tempo de resposta nao denuncie
        // quais emails existem na base (ver DUMMY_PASSWORD_HASH).
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

        // Conta desativada pelo admin: nega o login sem dar pista de que a senha
        // estaria certa (mesma resposta "null" de senha errada/usuario inexistente).
        if (!user || user.disabledAt || !valid) {
          registerLoginFailure(keys);
          return null;
        }

        registerLoginSuccess(keys);

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
      }
      // Disparado por update() no client apos a troca de senha, pra nao exigir
      // logout/login de novo so pra sair do estado "precisa trocar senha".
      if (trigger === "update" && session?.mustChangePassword === false) {
        token.mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN" | undefined) ?? "USER";
        session.user.mustChangePassword = (token.mustChangePassword as boolean | undefined) ?? false;
      }
      return session;
    },
  },
});
