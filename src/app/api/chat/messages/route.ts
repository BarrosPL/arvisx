import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getActiveUserThread, runAgentTurn, toChatMessageViews } from "@/lib/agent/orchestrator";

const sendMessageSchema = z.object({
  content: z.string().min(1),
  // Presente quando a mensagem veio de uma notificacao sobre uma proposta especifica -
  // ver runAgentTurn (orchestrator.ts) pra como isso vira contexto sem aparecer como
  // texto cru na bolha do usuario.
  contextProposalId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = sendMessageSchema.parse(await request.json());

    const thread = await getActiveUserThread(user.id);
    const messages = await runAgentTurn(thread.id, body.content, { contextProposalId: body.contextProposalId });

    return NextResponse.json({ messages: await toChatMessageViews(messages) });
  } catch (error) {
    return handleApiError(error);
  }
}
