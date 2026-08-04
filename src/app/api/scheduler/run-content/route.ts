import { NextRequest, NextResponse } from "next/server";
import { runContentSchedulerRound } from "@/lib/content/scheduler/runContentSchedulerRound";

/**
 * Rodada periodica do modulo de conteudo (retencao de leads, fatia 7 adiciona disparo
 * de webhook) - endpoint dedicado, separado de /api/scheduler/run (gestor de trafego),
 * porque a cadencia desejada e bem mais curta (minutos, nao horas) - ver
 * runContentSchedulerRound.ts. Mesmo padrao de protecao por secret compartilhado.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SCHEDULER_SECRET;
  const provided = request.headers.get("x-scheduler-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await runContentSchedulerRound();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 409 }
    );
  }
}
