import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { extractPaletteFromImage } from "@/lib/content/paletteExtraction";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const uploadSchema = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/**
 * Passo "Vamos agilizar" do wizard (upload de um post já publicado, no lugar de
 * conectar Instagram via OAuth - pedido do Renan, ver contexto do plano) - só devolve
 * a paleta extraída, não grava nada: o wizard aplica em memória, o usuário ainda
 * revisa/edita antes de salvar a marca de verdade.
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

    const palette = await extractPaletteFromImage(buffer);
    return NextResponse.json({ palette });
  } catch (error) {
    return handleApiError(error);
  }
}
