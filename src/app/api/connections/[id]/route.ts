import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ForbiddenError } from "@/lib/session";
import { handleApiError } from "@/lib/http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const connection = await prisma.providerConnection.findUniqueOrThrow({ where: { id } });
    if (connection.userId !== user.id) throw new ForbiddenError();

    await prisma.providerConnection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
