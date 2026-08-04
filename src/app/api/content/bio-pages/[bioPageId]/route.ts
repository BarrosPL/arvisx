import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";
import { updateBioPageSchema } from "@/lib/content/schema";

interface RouteParams {
  params: Promise<{ bioPageId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    const { bioPage } = await requireBioPageAccess(bioPageId);
    const blocks = await prisma.bioBlock.findMany({ where: { bioPageId }, orderBy: { position: "asc" } });
    return NextResponse.json({ bioPage, blocks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    await requireBioPageAccess(bioPageId);
    const body = updateBioPageSchema.parse(await request.json());
    // Campos Json nulaveis exigem Prisma.JsonNull pra virar SQL NULL - null puro e
    // interpretado como "nao mude este campo" pelo client, nao como um valor a gravar.
    const { theme, seo, pixels, ...rest } = body;

    const updated = await prisma.bioPage.update({
      where: { id: bioPageId },
      data: {
        ...rest,
        theme: theme === null ? Prisma.JsonNull : (theme as Prisma.InputJsonValue | undefined),
        seo: seo === null ? Prisma.JsonNull : (seo as Prisma.InputJsonValue | undefined),
        pixels: pixels === null ? Prisma.JsonNull : (pixels as Prisma.InputJsonValue | undefined),
        publishedAt: body.isPublished ? new Date() : undefined,
      },
    });

    return NextResponse.json({ bioPage: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Esse endereço (slug) já está em uso" }, { status: 409 });
    }
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    await requireBioPageAccess(bioPageId);
    await prisma.bioPage.delete({ where: { id: bioPageId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
