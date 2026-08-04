import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getActiveContentThread } from "@/lib/contentAgent/threads";
import { runContentAgentTurn, toContentChatMessageViews } from "@/lib/contentAgent/orchestrator";

const sendMessageSchema = z.object({
  content: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = sendMessageSchema.parse(await request.json());

    const thread = await getActiveContentThread(user.id);
    const messages = await runContentAgentTurn(thread.id, body.content);

    return NextResponse.json({ messages: toContentChatMessageViews(messages) });
  } catch (error) {
    return handleApiError(error);
  }
}
