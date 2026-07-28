import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/session";

/** Converte erros conhecidos (auth, validacao) em respostas HTTP consistentes. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Dados invalidos", issues: error.issues }, { status: 400 });
  }
  if (error instanceof Error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Erro interno" }, { status: 500 });
}
