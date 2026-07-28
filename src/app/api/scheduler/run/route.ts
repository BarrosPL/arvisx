import { NextRequest, NextResponse } from "next/server";
import { runProactiveRound } from "@/lib/scheduler/proactiveRound";

/**
 * Endpoint para disparar a rodada proativa manualmente ou via cron externo (EasyPanel na
 * Fase 4). O timer em src/instrumentation.ts ja chama a mesma funcao automaticamente -
 * essa rota existe pra permitir disparo sob demanda sem esperar o intervalo.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SCHEDULER_SECRET;
  const provided = request.headers.get("x-scheduler-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { runId } = await runProactiveRound();
    return NextResponse.json({ runId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 409 }
    );
  }
}
