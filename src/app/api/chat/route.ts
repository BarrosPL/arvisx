import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getActiveUserThread, startNewUserThread, toChatMessageViews } from "@/lib/agent/orchestrator";

export async function GET() {
  try {
    const user = await requireUser();

    const thread = await getActiveUserThread(user.id);
    const messages = await prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ thread, messages: await toChatMessageViews(messages) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * "Nova conversa": arquiva a thread ativa atual e devolve uma em branco (ver
 * startNewUserThread) - nada e apagado, so deixa de ser a thread ativa.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const thread = await startNewUserThread(user.id);
    return NextResponse.json({ thread, messages: [] });
  } catch (error) {
    return handleApiError(error);
  }
}
