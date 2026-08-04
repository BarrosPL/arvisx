import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";
import { updateBioBlockSchema } from "@/lib/content/schema";

interface RouteParams {
  params: Promise<{ bioPageId: string; blockId: string }>;
}

async function requireBlock(bioPageId: string, blockId: string) {
  const block = await prisma.bioBlock.findUniqueOrThrow({ where: { id: blockId } });
  if (block.bioPageId !== bioPageId) {
    throw new Error("Bloco não pertence a esta página");
  }
  return block;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId, blockId } = await params;
    await requireBioPageAccess(bioPageId);
    await requireBlock(bioPageId, blockId);
    const body = updateBioBlockSchema.parse(await request.json());

    const block = await prisma.bioBlock.update({
      where: { id: blockId },
      data: {
        ...(body.content ? { type: body.content.type, config: body.content.config } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.scheduleFrom !== undefined ? { scheduleFrom: body.scheduleFrom ? new Date(body.scheduleFrom) : null } : {}),
        ...(body.scheduleTo !== undefined ? { scheduleTo: body.scheduleTo ? new Date(body.scheduleTo) : null } : {}),
      },
    });

    return NextResponse.json({ block });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId, blockId } = await params;
    await requireBioPageAccess(bioPageId);
    await requireBlock(bioPageId, blockId);
    await prisma.bioBlock.delete({ where: { id: blockId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
