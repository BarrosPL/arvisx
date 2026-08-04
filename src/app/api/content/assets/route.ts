import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { storePublicImage } from "@/lib/media/publicAssets";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const uploadSchema = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/**
 * Upload de imagem pro produto de conteúdo (logo da marca por enquanto) - reaproveita
 * storePublicImage (mesmo mecanismo já usado pelo gestor de tráfego pra thumbnail de
 * anúncio em vídeo), só que aqui o próprio usuário sobe direto.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = uploadSchema.parse(await request.json());
    if (!ALLOWED_IMAGE_MIME_TYPES.has(body.mimeType)) {
      throw new Error("Formato de imagem não suportado - use JPEG, PNG ou WEBP");
    }

    const buffer = Buffer.from(body.dataBase64, "base64");
    if (buffer.length === 0) throw new Error("Imagem vazia");
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Imagem muito grande - limite de ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
    }

    const asset = await storePublicImage(buffer, body.mimeType);
    return NextResponse.json({ asset });
  } catch (error) {
    return handleApiError(error);
  }
}
