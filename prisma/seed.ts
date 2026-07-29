import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BRAND_REGISTRY } from "../src/lib/brands/registry";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL || "renan@perrottiadv.com";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || "trocar-esta-senha";
  const ownerName = process.env.SEED_OWNER_NAME || "Renan Perrotti";

  const passwordHash = await bcrypt.hash(ownerPassword, 12);

  // As policies de RLS da tabela User (migration add_user_admin_rls) exigem que quem
  // escreve seja admin - exceto na janela de bootstrap (nenhum admin ainda existe no
  // sistema). Como este script so roda com acesso direto ao banco (ja e uma operacao
  // de confianca), ele age "em nome" do primeiro admin que encontrar so pra passar
  // nessa checagem; fora da janela de bootstrap, se ainda nao existir nenhum admin,
  // o placeholder abaixo e ignorado pela policy mesmo assim.
  const anyAdmin = await prisma.user.findFirst({ where: { role: "ADMIN", disabledAt: null } });

  const owner = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${anyAdmin?.id ?? "seed-bootstrap"}, true)`;
    return tx.user.upsert({
      where: { email: ownerEmail },
      update: {},
      create: {
        email: ownerEmail,
        name: ownerName,
        passwordHash,
      },
    });
  });

  for (const brand of BRAND_REGISTRY) {
    const record = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: {
        name: brand.name,
        priorityOrder: brand.priorityOrder,
        topicKeywords: brand.topicKeywords,
        excludedKeywords: brand.excludedKeywords,
      },
      create: {
        slug: brand.slug,
        name: brand.name,
        status: "ACTIVE",
        priorityOrder: brand.priorityOrder,
        topicKeywords: brand.topicKeywords,
        excludedKeywords: brand.excludedKeywords,
      },
    });

    await prisma.brandAccess.upsert({
      where: { userId_brandId: { userId: owner.id, brandId: record.id } },
      update: { role: "OWNER" },
      create: { userId: owner.id, brandId: record.id, role: "OWNER" },
    });
  }

  console.log(`Seed concluido. Usuario owner: ${ownerEmail}`);
  if (!process.env.SEED_OWNER_PASSWORD) {
    console.log(`Senha padrao (TROCAR): ${ownerPassword}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
