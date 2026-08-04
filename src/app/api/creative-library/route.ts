import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAccountAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;

const funnelStageSchema = z.enum(["FRIO", "MORNO", "QUENTE", "REMARKETING", "LOOKALIKE"]).optional();

const createSchema = z
  .object({
    credentialId: z.string().min(1),
    productName: z.string().trim().min(1),
    hook: z.string().trim().min(1),
    funnelStage: funnelStageSchema,
    label: z.string().trim().min(1),
    notes: z.string().trim().optional(),
    dataBase64: z.string().optional(),
    mimeType: z.enum(["image/jpeg", "image/png"]).optional(),
    videoBase64: z.string().optional(),
    videoMimeType: z.enum(["video/mp4", "video/quicktime"]).optional(),
    coverImageBase64: z.string().optional(),
    coverImageMimeType: z.enum(["image/jpeg", "image/png"]).optional(),
  })
  .refine(
    (body) =>
      (!!body.dataBase64 && !!body.mimeType) ||
      (!!body.videoBase64 && !!body.videoMimeType && !!body.coverImageBase64 && !!body.coverImageMimeType),
    { message: "Envie imagem (dataBase64+mimeType) ou vídeo+capa (videoBase64+videoMimeType+coverImageBase64+coverImageMimeType)" }
  );

/**
 * Banco de criativos por produto/gancho (spec secao 3) - so catalogo, sem ligacao com
 * o upload de criativo de propostas (decisao do Renan em 2026-08-04). Metadados +
 * arquivo sobem numa chamada so (diferente do fluxo de Proposal, aqui nao existe
 * "criar depois anexar" - o item so faz sentido ja completo).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const credentialId = request.nextUrl.searchParams.get("credentialId");

    const assets = await prisma.creativeLibraryAsset.findMany({
      where: {
        credential: { providerConnection: { userId: user.id } },
        ...(credentialId ? { credentialId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        credentialId: true,
        productName: true,
        hook: true,
        funnelStage: true,
        label: true,
        notes: true,
        creativeAssetMimeType: true,
        creativeVideoMimeType: true,
        creativeCoverImageMimeType: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      assets: assets.map((asset) => ({
        ...asset,
        kind: asset.creativeVideoMimeType ? "VIDEO" : "IMAGE",
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = createSchema.parse(await request.json());
    await requireAccountAccess(body.credentialId);

    if (body.dataBase64 && body.mimeType) {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(body.mimeType)) {
        throw new Error("Formato de imagem não suportado - use JPEG ou PNG");
      }
      const buffer = Buffer.from(body.dataBase64, "base64");
      if (buffer.length === 0) throw new Error("Imagem vazia");
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error(`Imagem muito grande - limite de ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
      }

      const asset = await prisma.creativeLibraryAsset.create({
        data: {
          credentialId: body.credentialId,
          productName: body.productName,
          hook: body.hook,
          funnelStage: body.funnelStage,
          label: body.label,
          notes: body.notes || null,
          creativeAssetData: new Uint8Array(buffer),
          creativeAssetMimeType: body.mimeType,
        },
        select: { id: true },
      });
      return NextResponse.json({ asset });
    }

    if (!body.videoMimeType || !body.coverImageMimeType) {
      throw new Error("Dados de vídeo incompletos");
    }
    if (!ALLOWED_VIDEO_MIME_TYPES.has(body.videoMimeType)) {
      throw new Error("Formato de vídeo não suportado - use MP4 ou MOV");
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(body.coverImageMimeType)) {
      throw new Error("Formato de imagem de capa não suportado - use JPEG ou PNG");
    }
    const videoBuffer = Buffer.from(body.videoBase64!, "base64");
    if (videoBuffer.length === 0) throw new Error("Vídeo vazio");
    if (videoBuffer.length > MAX_VIDEO_BYTES) {
      throw new Error(`Vídeo muito grande - limite de ${MAX_VIDEO_BYTES / (1024 * 1024)}MB`);
    }
    const coverBuffer = Buffer.from(body.coverImageBase64!, "base64");
    if (coverBuffer.length === 0) throw new Error("Imagem de capa vazia");
    if (coverBuffer.length > MAX_COVER_IMAGE_BYTES) {
      throw new Error(`Imagem de capa muito grande - limite de ${MAX_COVER_IMAGE_BYTES / (1024 * 1024)}MB`);
    }

    const asset = await prisma.creativeLibraryAsset.create({
      data: {
        credentialId: body.credentialId,
        productName: body.productName,
        hook: body.hook,
        funnelStage: body.funnelStage,
        label: body.label,
        notes: body.notes || null,
        creativeVideoData: new Uint8Array(videoBuffer),
        creativeVideoMimeType: body.videoMimeType,
        creativeCoverImageData: new Uint8Array(coverBuffer),
        creativeCoverImageMimeType: body.coverImageMimeType,
      },
      select: { id: true },
    });
    return NextResponse.json({ asset });
  } catch (error) {
    return handleApiError(error);
  }
}
