import { prisma } from "@/lib/prisma";
import { requireUser, ForbiddenError, type SessionUser } from "@/lib/session";
import type { Brand, Content } from "@/generated/prisma/client";

/**
 * Espelha assertAccountAccess/requireAccountAccess (lib/session.ts) pro produto novo
 * de conteúdo - mesma lógica de posse ("dono é quem criou"), schema Postgres
 * diferente (content, sem relation Prisma pra arvisx.User de propósito - ver
 * comentário no model Brand em schema.prisma).
 */
export async function assertBrandAccess(userId: string, brandId: string): Promise<Brand> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand || brand.ownerUserId !== userId) {
    throw new ForbiddenError();
  }
  return brand;
}

export async function requireBrandAccess(brandId: string): Promise<{ user: SessionUser; brand: Brand }> {
  const user = await requireUser();
  const brand = await assertBrandAccess(user.id, brandId);
  return { user, brand };
}

/** Lista todas as marcas do usuário (multi-marca real - `ownerUserId` nunca teve
 * constraint de unicidade, "uma marca por usuário" sempre foi só suposição de app).
 * Mais recente primeiro, pra "Gerenciar Marcas" mostrar o que foi mexido por último
 * no topo. */
export async function listUserBrands(userId: string): Promise<Brand[]> {
  return prisma.brand.findMany({ where: { ownerUserId: userId }, orderBy: { updatedAt: "desc" } });
}

/** Posse de uma peça gerada passa pela marca dona dela (Content não tem ownerUserId
 * próprio) - usado pela revisão conversacional (Fatia 7) e pela rota de imagem. */
export async function assertContentAccess(userId: string, contentId: string): Promise<Content> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new ForbiddenError();
  await assertBrandAccess(userId, content.brandId);
  return content;
}
