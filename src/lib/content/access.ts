import { prisma } from "@/lib/prisma";
import { requireUser, ForbiddenError, type SessionUser } from "@/lib/session";
import type { Brand, BioPage, LeadForm, Lead } from "@/generated/prisma/client";

/**
 * Espelha assertAccountAccess/requireAccountAccess (lib/session.ts) pro modulo de
 * conteudo - mesma logica de posse ("dono e quem criou"), schema Postgres diferente
 * (content, sem relation Prisma pra arvisx.User de proposito - ver comentario no model
 * Brand em schema.prisma).
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

/** Resolve a posse a partir de um bioPageId (rotas aninhadas tipo /bio-pages/[id]/blocks
 * nao recebem brandId direto do cliente - evita um usuario forjar acesso trocando so o
 * brandId no corpo da requisicao). */
export async function requireBioPageAccess(
  bioPageId: string
): Promise<{ user: SessionUser; brand: Brand; bioPage: BioPage }> {
  const user = await requireUser();
  const bioPage = await prisma.bioPage.findUniqueOrThrow({ where: { id: bioPageId } });
  const brand = await assertBrandAccess(user.id, bioPage.brandId);
  return { user, brand, bioPage };
}

/** Mesma ideia, a partir de um leadFormId (rotas /lead-forms/[id] e /leads não recebem
 * brandId direto do cliente). */
export async function requireLeadFormAccess(
  leadFormId: string
): Promise<{ user: SessionUser; brand: Brand; leadForm: LeadForm }> {
  const user = await requireUser();
  const leadForm = await prisma.leadForm.findUniqueOrThrow({ where: { id: leadFormId } });
  const brand = await assertBrandAccess(user.id, leadForm.brandId);
  return { user, brand, leadForm };
}

/** Mesma ideia, a partir de um leadId (rota /leads/[id] pra atualizar status). */
export async function requireLeadAccess(leadId: string): Promise<{ user: SessionUser; brand: Brand; lead: Lead }> {
  const user = await requireUser();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const brand = await assertBrandAccess(user.id, lead.brandId);
  return { user, brand, lead };
}
