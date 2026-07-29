import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getOrCreateUserThread, runAgentTurn, toChatMessageViews } from "@/lib/agent/orchestrator";

const sendMessageSchema = z.object({
  content: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = sendMessageSchema.parse(await request.json());

    const thread = await getOrCreateUserThread(user.id);
    const messages = await runAgentTurn(thread.id, body.content);

    return NextResponse.json({ messages: await toChatMessageViews(messages) });
  } catch (error) {
    return handleApiError(error);
  }
}
