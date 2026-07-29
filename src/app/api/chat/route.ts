import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getOrCreateUserThread, toChatMessageViews } from "@/lib/agent/orchestrator";

export async function GET() {
  try {
    const user = await requireUser();

    const thread = await getOrCreateUserThread(user.id);
    const messages = await prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ thread, messages: await toChatMessageViews(messages) });
  } catch (error) {
    return handleApiError(error);
  }
}
