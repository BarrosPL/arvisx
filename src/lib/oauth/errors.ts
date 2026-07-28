import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

function isStaleSessionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003" &&
    String(error.meta?.constraint ?? "").includes("userId")
  );
}

/**
 * Trata o erro final de um callback OAuth. Se o erro for uma sessao referenciando um
 * usuario que nao existe mais no banco (ex: apos um reset de dados), manda pro login em
 * vez de vazar o erro cru do Prisma - o usuario so precisa entrar de novo.
 */
export function redirectForOAuthError(
  error: unknown,
  request: NextRequest,
  fallbackMessage: string
): NextResponse {
  if (isStaleSessionError(error)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("session_error", "Sua sessão expirou. Faça login novamente e tente conectar de novo.");
    return NextResponse.redirect(url);
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  const url = new URL("/connections", request.url);
  url.searchParams.set("oauth_error", message);
  return NextResponse.redirect(url);
}
