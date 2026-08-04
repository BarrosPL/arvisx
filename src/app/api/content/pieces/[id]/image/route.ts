import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { assertBrandAccess } from "@/lib/content/access";
import { handleApiError } from "@/lib/http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Serve o PNG de uma peça gerada - autenticado (diferente de /api/public/media, que
 * existe só pra Meta baixar thumbnail de anúncio): estas são peças privadas do usuário,
 * checa posse via Brand.ownerUserId antes de devolver qualquer byte. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const content = await prisma.content.findUniqueOrThrow({
      where: { id },
      select: { brandId: true, imageData: true, imageMimeType: true },
    });
    await assertBrandAccess(user.id, content.brandId);

    return new NextResponse(new Uint8Array(content.imageData), {
      headers: { "Content-Type": content.imageMimeType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
