import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getOrCreateBrandThread } from "@/lib/agent/orchestrator";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    const { user } = await requireBrandAccess(brandId, "VIEWER");

    const thread = await getOrCreateBrandThread(brandId, user.id);
    const messages = await prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ thread, messages });
  } catch (error) {
    return handleApiError(error);
  }
}
