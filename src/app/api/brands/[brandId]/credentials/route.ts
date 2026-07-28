import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId, "VIEWER");

    const credentials = await prisma.adCredential.findMany({
      where: { brandId },
      orderBy: { createdAt: "asc" },
      include: { providerConnection: { select: { label: true } } },
    });

    return NextResponse.json({ credentials });
  } catch (error) {
    return handleApiError(error);
  }
}
