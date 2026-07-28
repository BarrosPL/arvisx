import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getOrCreateBrandThread, runAgentTurn } from "@/lib/agent/orchestrator";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

const sendMessageSchema = z.object({
  content: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    const { user } = await requireBrandAccess(brandId, "VIEWER");
    const body = sendMessageSchema.parse(await request.json());

    const thread = await getOrCreateBrandThread(brandId, user.id);
    const messages = await runAgentTurn(thread.id, body.content);

    return NextResponse.json({ messages });
  } catch (error) {
    return handleApiError(error);
  }
}
