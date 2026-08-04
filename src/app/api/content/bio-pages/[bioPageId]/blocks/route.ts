import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";
import { createBioBlockSchema } from "@/lib/content/schema";

interface RouteParams {
  params: Promise<{ bioPageId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    await requireBioPageAccess(bioPageId);
    const body = createBioBlockSchema.parse(await request.json());

    const last = await prisma.bioBlock.findFirst({
      where: { bioPageId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const block = await prisma.bioBlock.create({
      data: {
        bioPageId,
        type: body.type,
        config: body.config,
        position: (last?.position ?? -1) + 1,
        scheduleFrom: body.scheduleFrom ? new Date(body.scheduleFrom) : null,
        scheduleTo: body.scheduleTo ? new Date(body.scheduleTo) : null,
      },
    });

    return NextResponse.json({ block });
  } catch (error) {
    return handleApiError(error);
  }
}
