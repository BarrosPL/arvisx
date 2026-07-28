import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { executeProposal } from "@/lib/execution/executor";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id } });
    const { user } = await requireBrandAccess(proposal.brandId, "MANAGER");

    const executionLog = await executeProposal(id, user.id);
    return NextResponse.json({ executionLog });
  } catch (error) {
    return handleApiError(error);
  }
}
