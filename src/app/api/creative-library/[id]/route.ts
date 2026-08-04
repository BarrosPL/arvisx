import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const asset = await prisma.creativeLibraryAsset.findUniqueOrThrow({ where: { id } });
    await requireAccountAccess(asset.credentialId);

    await prisma.creativeLibraryAsset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
