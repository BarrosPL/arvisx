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
 * Upload de imagem pro modulo de conteudo (bloco IMAGE, avatar/capa da bio page) -
 * reaproveita storePublicImage (mesmo mecanismo ja usado pelo gestor de trafego pra
 * thumbnail de anuncio em video), so que aqui o proprio usuario e quem sobe direto,
 * nao um passo interno do executor.
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
