import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getActiveContentThread, startNewContentThread } from "@/lib/contentAgent/threads";
import { toContentChatMessageViews } from "@/lib/contentAgent/orchestrator";

export async function GET() {
  try {
    const user = await requireUser();

    const thread = await getActiveContentThread(user.id);
    const messages = await prisma.contentMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ thread, messages: toContentChatMessageViews(messages) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** "Nova conversa": arquiva a thread ativa atual e devolve uma em branco - nada e
 * apagado (ver startNewContentThread). */
export async function POST() {
  try {
    const user = await requireUser();
    const thread = await startNewContentThread(user.id);
    return NextResponse.json({ thread, messages: [] });
  } catch (error) {
    return handleApiError(error);
  }
}
