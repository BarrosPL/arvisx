import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
 * Nucleo do controle de acesso a dado de anuncio: confere se a conta `credentialId`
 * pertence a uma conexao OAuth do proprio `userId`.
 *
 * Substituiu o antigo assertBrandRole (que consultava BrandAccess) quando o conceito de
 * "Marca" foi removido. A cadeia de posse agora e
 * usuario -> ProviderConnection -> AdCredential, e nao ha mais papeis
 * (VIEWER/MANAGER/OWNER) nem compartilhamento entre usuarios: quem conectou o login e o
 * dono de tudo que veio dele. Fica fora de um request HTTP de proposito, pra ser
 * chamavel tambem das tools de chat (que so tem um userId em memoria).
 */
export async function assertAccountAccess(userId: string, credentialId: string) {
  const credential = await prisma.adCredential.findUnique({
    where: { id: credentialId },
    include: { providerConnection: { select: { userId: true } } },
  });

  if (!credential || credential.providerConnection.userId !== userId) {
    throw new ForbiddenError();
  }

  return credential;
}

/** Versao HTTP de assertAccountAccess - resolve o usuario da sessao. Nenhuma rota que
 * toca dado de uma conta de anuncio deve pular esta funcao. */
export async function requireAccountAccess(credentialId: string) {
  const user = await requireUser();
  const credential = await assertAccountAccess(user.id, credentialId);
  return { user, credential };
}

/** Ids de todas as contas de anuncio do usuario - usado onde a consulta e "tudo que e
 * meu" (dashboard, notificacoes, roster do chat) em vez de uma conta especifica. */
export async function listAccountIdsForUser(userId: string): Promise<string[]> {
  const credentials = await prisma.adCredential.findMany({
    where: { providerConnection: { userId } },
    select: { id: true },
  });
  return credentials.map((credential) => credential.id);
}
