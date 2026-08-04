import { prisma } from "@/lib/prisma";

/**
 * Apaga leads mais velhos que Brand.leadRetentionDays (RGPD: direito ao apagamento,
 * job de retencao configuravel por marca - F7.4). Um DELETE so, cruzando Lead/Brand
 * pelo intervalo de cada marca - nao da pra expressar isso com o Prisma Client comum
 * (o "dias" varia por linha de Brand), daqui o SQL puro.
 */
export async function runLeadRetentionRound(): Promise<{ deleted: number }> {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "content"."Lead" AS lead
    USING "content"."Brand" AS brand
    WHERE lead."brandId" = brand.id
      AND lead."createdAt" < now() - (brand."leadRetentionDays" || ' days')::interval
  `;
  return { deleted };
}
