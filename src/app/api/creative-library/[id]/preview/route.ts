import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Preview autenticado (diferente de /api/public/media, que existe so pra Meta baixar
 * thumbnail de anuncio) - imagem direta ou capa do video, o que existir. Nunca serve o
 * video em si (nao ha necessidade de reproduzir, so identificar visualmente o item).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const asset = await prisma.creativeLibraryAsset.findUniqueOrThrow({
      where: { id },
      select: {
        credentialId: true,
        creativeAssetData: true,
        creativeAssetMimeType: true,
        creativeCoverImageData: true,
        creativeCoverImageMimeType: true,
      },
    });
    await requireAccountAccess(asset.credentialId);

    const data = asset.creativeAssetData ?? asset.creativeCoverImageData;
    const mimeType = asset.creativeAssetMimeType ?? asset.creativeCoverImageMimeType;
    if (!data || !mimeType) {
      return NextResponse.json({ error: "Sem imagem" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
