import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BrandRole } from "@/generated/prisma/client";

const ROLE_RANK: Record<BrandRole, number> = {
  VIEWER: 1,
  MANAGER: 2,
  OWNER: 3,
};

export class UnauthorizedError extends Error {
  constructor(message = "Nao autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Sem acesso a este recurso") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

/** Retorna o usuario autenticado ou lanca UnauthorizedError. Usar em toda rota/pagina protegida. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new UnauthorizedError();
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/**
 * Garante que o usuario autenticado e admin de sistema (role global, nao BrandRole).
 * Esta e so a checagem rapida do lado da aplicacao (pra dar 403 cedo e com boa
 * mensagem) - a garantia de verdade contra escrita indevida na tabela User e a policy
 * de RLS (migration add_user_admin_rls), que reconsulta o banco e nao confia nesta
 * funcao. Usar em toda rota/pagina de /admin.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new UnauthorizedError();
  }
  if (session.user.role !== "ADMIN") {
    throw new ForbiddenError("Acesso restrito a administradores");
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/**
 * Nucleo do brand firewall no nivel de acesso: confere se `userId` tem, no minimo, o
 * papel `minRole` na marca `brandId`, contra o BrandAccess real do banco. Extraido de
 * `requireBrandAccess` pra ser reutilizavel fora de um request HTTP (ex: tools de chat,
 * que so tem um userId em memoria - nunca um cookie de sessao pra ler via requireUser()).
 * Lanca ForbiddenError se o acesso nao existir ou o papel for insuficiente.
 */
export async function assertBrandRole(userId: string, brandId: string, minRole: BrandRole = "VIEWER") {
  const access = await prisma.brandAccess.findUnique({
    where: { userId_brandId: { userId, brandId } },
  });

  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError();
  }

  return access;
}

/**
 * Garante que o usuario autenticado tem, no minimo, o papel `minRole` na marca `brandId`.
 * Esta e a checagem de brand firewall no nivel de acesso: nenhuma rota de marca deve
 * pular esta funcao.
 */
export async function requireBrandAccess(brandId: string, minRole: BrandRole = "VIEWER") {
  const user = await requireUser();
  const access = await assertBrandRole(user.id, brandId, minRole);
  return { user, access };
}
