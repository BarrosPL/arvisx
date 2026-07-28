import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { runProactiveRound } from "@/lib/scheduler/proactiveRound";

/**
 * Dispara a rodada proativa sob demanda a partir do botao "Analisar agora" no
 * dashboard - protegida pela sessao do usuario (nao pelo SCHEDULER_SECRET, que e
 * so pro cron externo em /api/scheduler/run). Mesma funcao que o timer em
 * instrumentation.ts chama automaticamente.
 */
export async function POST(_request: NextRequest) {
  try {
    await requireUser();
    const { runId } = await runProactiveRound();
    return NextResponse.json({ runId });
  } catch (error) {
    return handleApiError(error);
  }
}
