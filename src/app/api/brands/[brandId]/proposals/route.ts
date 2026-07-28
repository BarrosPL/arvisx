import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ProposalStatus } from "@/generated/prisma/client";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId, "VIEWER");

    const statusParam = request.nextUrl.searchParams.get("status");
    const status =
      statusParam && statusParam in ProposalStatus ? (statusParam as ProposalStatus) : undefined;

    const proposals = await prisma.proposal.findMany({
      where: { brandId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ proposals });
  } catch (error) {
    return handleApiError(error);
  }
}
