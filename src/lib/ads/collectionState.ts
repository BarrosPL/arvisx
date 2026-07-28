import { CollectionState } from "@/generated/prisma/client";

const AUTH_ERROR_PATTERNS = [
  /oauthexception/i,
  /code["\s:=]*190/i,
  /subcode["\s:=]*467/i,
  /invalid_grant/i,
  /authorization grant/i,
  /invalid or expired/i,
  /token.*expired/i,
  /refresh token/i,
  /unauthenticated/i,
  /permission.*denied/i,
];

/**
 * Classifica uma falha de coleta como AUTH_ERROR (credencial quebrada) ou API_ERROR (outro problema).
 * Nunca deve ser confundido com "zero anuncios" (EMPTY) - ver classifyRows.
 */
export function classifyCollectionError(error: unknown): { state: CollectionState; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const isAuthError = AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  return {
    state: isAuthError ? CollectionState.AUTH_ERROR : CollectionState.API_ERROR,
    message,
  };
}

export function classifyRows(rowCount: number): CollectionState {
  return rowCount > 0 ? CollectionState.OK : CollectionState.EMPTY;
}
