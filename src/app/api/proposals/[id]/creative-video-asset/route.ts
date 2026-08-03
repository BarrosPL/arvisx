import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccountAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
// Video de anuncio real (feed/reels, alguns segundos a poucos minutos) cabe folgado
// aqui - nao e defesa contra arquivo grande arbitrario, e o teto pratico do caso de
// uso. Precisa bater com experimental.proxyClientMaxBodySize em next.config.ts (que
// cobre o corpo JSON inteiro, maior que so o video por causa da inflacao do base64 +
// a imagem de capa) - se um dia subir este limite, o outro tem que subir junto.
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;

const uploadSchema = z.object({
  videoBase64: z.string().min(1),
  videoMimeType: z.enum(["video/mp4", "video/quicktime"]),
  coverImageBase64: z.string().min(1),
  coverImageMimeType: z.enum(["image/jpeg", "image/png"]),
});

/**
 * Equivalente a /creative-asset, mas pro caminho de VIDEO (dois arquivos numa
 * chamada so: o video e a capa/thumbnail) - ver o comentario dos campos
 * creativeVideoData/creativeCoverImageData no schema.prisma pro motivo de precisar dos dois.
 * So NEW_CAMPAIGN Meta em NEEDS_MORE_DATA aceita isto, exatamente como a rota de
 * imagem - as duas sao caminhos alternativos pro mesmo estado, nunca usadas juntas
 * na mesma proposta (o executor decide qual delas rodar olhando qual par de campos
 * foi preenchido).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id } });
    await requireAccountAccess(proposal.credentialId);

    if (proposal.type !== "NEW_CAMPAIGN") {
      throw new Error("Só propostas de campanha nova aceitam vídeo de criativo");
    }
    if (proposal.platform !== "META") {
      throw new Error("Anúncio em vídeo só é suportado no Meta nesta versão");
    }
    if (proposal.status !== "NEEDS_MORE_DATA") {
      throw new Error(`Proposta precisa estar aguardando dado (está em ${proposal.status})`);
    }
    assertProposalTransition(proposal.status as ProposalStatus, "PENDING");

    const body = uploadSchema.parse(await request.json());
    if (!ALLOWED_VIDEO_MIME_TYPES.has(body.videoMimeType)) {
      throw new Error("Formato de vídeo não suportado - use MP4 ou MOV");
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(body.coverImageMimeType)) {
      throw new Error("Formato de imagem de capa não suportado - use JPEG ou PNG");
    }

    const videoBuffer = Buffer.from(body.videoBase64, "base64");
    if (videoBuffer.length === 0) {
      throw new Error("Vídeo vazio");
    }
    if (videoBuffer.length > MAX_VIDEO_BYTES) {
      throw new Error(`Vídeo muito grande - limite de ${MAX_VIDEO_BYTES / (1024 * 1024)}MB`);
    }

    const coverBuffer = Buffer.from(body.coverImageBase64, "base64");
    if (coverBuffer.length === 0) {
      throw new Error("Imagem de capa vazia");
    }
    if (coverBuffer.length > MAX_COVER_IMAGE_BYTES) {
      throw new Error(`Imagem de capa muito grande - limite de ${MAX_COVER_IMAGE_BYTES / (1024 * 1024)}MB`);
    }

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        creativeVideoData: new Uint8Array(videoBuffer),
        creativeVideoMimeType: body.videoMimeType,
        creativeCoverImageData: new Uint8Array(coverBuffer),
        creativeCoverImageMimeType: body.coverImageMimeType,
        status: "PENDING",
      },
    });

    return NextResponse.json({ proposal: { id: updated.id, status: updated.status } });
  } catch (error) {
    return handleApiError(error);
  }
}
