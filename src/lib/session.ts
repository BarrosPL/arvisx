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
 * Garante que o usuario autenticado tem, no minimo, o papel `minRole` na marca `brandId`.
 * Esta e a checagem de brand firewall no nivel de acesso: nenhuma rota de marca deve
 * pular esta funcao.
 */
export async function requireBrandAccess(brandId: string, minRole: BrandRole = "VIEWER") {
  const user = await requireUser();
  const access = await prisma.brandAccess.findUnique({
    where: { userId_brandId: { userId: user.id, brandId } },
  });

  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError();
  }

  return { user, access };
}
