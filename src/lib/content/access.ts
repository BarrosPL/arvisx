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

/** V1 é uma marca por usuário (preenchimento manual, sem tela de "criar nova marca"
 * ainda) - resolve a única marca do usuário logado, se existir. */
export async function getUserBrand(userId: string): Promise<Brand | null> {
  return prisma.brand.findFirst({ where: { ownerUserId: userId } });
}

/** Posse de uma peça gerada passa pela marca dona dela (Content não tem ownerUserId
 * próprio) - usado pela revisão conversacional (Fatia 7) e pela rota de imagem. */
export async function assertContentAccess(userId: string, contentId: string): Promise<Content> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new ForbiddenError();
  await assertBrandAccess(userId, content.brandId);
  return content;
}
