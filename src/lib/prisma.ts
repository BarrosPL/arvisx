import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  // A aplicacao roda com um papel de Postgres restrito (nao-superusuario), diferente
  // do papel usado por `prisma migrate deploy`/seed (esse precisa de privilegio de
  // dono pra ALTER TABLE/CREATE POLICY). Isso nao e cosmetico: a RLS da tabela User
  // (migration add_user_admin_rls) so tem efeito real numa conexao sem superusuario/
  // BYPASSRLS - Postgres ignora RLS pra essas incondicionalmente. Ver migration
  // add_restricted_app_role e instrucoes de deploy pra criar/configurar este papel.
  const connectionString = process.env.APP_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "APP_DATABASE_URL não configurada - a aplicação precisa de uma connection string separada, " +
        "usando o papel Postgres restrito (não-superusuário), pra RLS funcionar de verdade. " +
        "Ver migration add_restricted_app_role."
    );
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  return new PrismaClient({
    adapter,
  });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Proxy em vez de instanciar direto: `next build` importa todo route.ts pra coletar
// dados de build ("Collecting page data"), o que rodaria este modulo mesmo sem
// nenhuma request de verdade acontecer. Com o proxy, APP_DATABASE_URL so precisa
// existir quando uma query e efetivamente chamada (ex: prisma.user.findMany) - nunca
// no build, so em runtime.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient() as object, prop, receiver);
  },
});