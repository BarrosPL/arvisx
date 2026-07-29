/**
 * Cria (ou atualiza) uma conta com papel ADMIN direto no banco - "break glass" pra
 * quando ninguem ainda tem acesso ao painel /admin (ex: primeiro admin do sistema) ou
 * pra recuperar acesso se todos os admins ficarem sem senha. Usa APP_DATABASE_URL (o
 * papel restrito, nao o superusuario de migrations) - a janela de bootstrap da RLS
 * (migration add_user_admin_rls) libera INSERT/UPDATE em User pra qualquer papel
 * enquanto nao existir nenhum admin ativo, entao nao precisa de privilegio de dono.
 *
 * Uso: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run admin:bootstrap
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.APP_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !name || !password) {
    console.error("Defina ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD antes de rodar este script.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });

  const admin = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${existing?.id ?? "bootstrap"}, true)`;
    return tx.user.upsert({
      where: { email },
      update: { name, passwordHash, role: "ADMIN", mustChangePassword: true, disabledAt: null },
      create: { email, name, passwordHash, role: "ADMIN", mustChangePassword: true },
    });
  });

  console.log(`Admin pronto: ${admin.email} (id ${admin.id}). Senha temporaria - troca obrigatoria no 1o login.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
