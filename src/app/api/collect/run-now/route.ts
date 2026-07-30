import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { runCollectRound } from "@/lib/scheduler/collectRound";

/**
 * Atualiza os dados do dashboard sob demanda - so a COLETA de metricas de campanha,
 * sem ranking, sem proposta e sem nenhuma chamada de IA (diferente de
 * /api/scheduler/run-now, que dispara a rodada de analise completa e cara).
 */
export async function POST() {
  try {
    await requireUser();
    const result = await runCollectRound();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
