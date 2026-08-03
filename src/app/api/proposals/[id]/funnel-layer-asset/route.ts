import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAccountAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;

const uploadSchema = z
  .object({
    layerKey: z.enum(["FRIO", "MORNO", "QUENTE", "REMARKETING", "LOOKALIKE"]),
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
 * Equivalente a /creative-asset e /creative-video-asset, mas por CAMADA da esteira -
 * so NEW_FUNNEL aceita isto. Cada uma das 5 camadas (ProposalFunnelLayer) recebe seu
 * proprio criativo, imagem OU video+capa (mesma exclusividade das rotas de
 * NEW_CAMPAIGN, so que aqui por linha). A proposta so sai de NEEDS_MORE_DATA quando
 * TODAS as 5 camadas tiverem algum criativo anexado - upload parcial fica salvo mas a
 * proposta continua esperando o resto.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id } });
    await requireAccountAccess(proposal.credentialId);

    if (proposal.type !== "NEW_FUNNEL") {
      throw new Error("Só propostas de funil (5 camadas) aceitam criativo por camada");
    }
    if (proposal.status !== "NEEDS_MORE_DATA") {
      throw new Error(`Proposta precisa estar aguardando dado (está em ${proposal.status})`);
    }

    const body = uploadSchema.parse(await request.json());

    const layer = await prisma.proposalFunnelLayer.findUnique({
      where: { proposalId_layerKey: { proposalId: id, layerKey: body.layerKey } },
    });
    if (!layer) {
      throw new Error(`Camada ${body.layerKey} não existe nesta proposta`);
    }

    if (body.dataBase64 && body.mimeType) {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(body.mimeType)) {
        throw new Error("Formato de imagem não suportado - use JPEG ou PNG");
      }
      const buffer = Buffer.from(body.dataBase64, "base64");
      if (buffer.length === 0) throw new Error("Imagem vazia");
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error(`Imagem muito grande - limite de ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
      }
      await prisma.proposalFunnelLayer.update({
        where: { id: layer.id },
        data: { creativeAssetData: new Uint8Array(buffer), creativeAssetMimeType: body.mimeType },
      });
    } else if (body.videoBase64 && body.videoMimeType && body.coverImageBase64 && body.coverImageMimeType) {
      if (!ALLOWED_VIDEO_MIME_TYPES.has(body.videoMimeType)) {
        throw new Error("Formato de vídeo não suportado - use MP4 ou MOV");
      }
      if (!ALLOWED_IMAGE_MIME_TYPES.has(body.coverImageMimeType)) {
        throw new Error("Formato de imagem de capa não suportado - use JPEG ou PNG");
      }
      const videoBuffer = Buffer.from(body.videoBase64, "base64");
      if (videoBuffer.length === 0) throw new Error("Vídeo vazio");
      if (videoBuffer.length > MAX_VIDEO_BYTES) {
        throw new Error(`Vídeo muito grande - limite de ${MAX_VIDEO_BYTES / (1024 * 1024)}MB`);
      }
      const coverBuffer = Buffer.from(body.coverImageBase64, "base64");
      if (coverBuffer.length === 0) throw new Error("Imagem de capa vazia");
      if (coverBuffer.length > MAX_COVER_IMAGE_BYTES) {
        throw new Error(`Imagem de capa muito grande - limite de ${MAX_COVER_IMAGE_BYTES / (1024 * 1024)}MB`);
      }
      await prisma.proposalFunnelLayer.update({
        where: { id: layer.id },
        data: {
          creativeVideoData: new Uint8Array(videoBuffer),
          creativeVideoMimeType: body.videoMimeType,
          creativeCoverImageData: new Uint8Array(coverBuffer),
          creativeCoverImageMimeType: body.coverImageMimeType,
        },
      });
    }

    const allLayers = await prisma.proposalFunnelLayer.findMany({ where: { proposalId: id } });
    const allDone = allLayers.every(
      (l) => l.creativeAssetData !== null || (l.creativeVideoData !== null && l.creativeCoverImageData !== null)
    );

    let status: ProposalStatus = proposal.status as ProposalStatus;
    if (allDone) {
      assertProposalTransition(proposal.status as ProposalStatus, "PENDING");
      const updated = await prisma.proposal.update({ where: { id }, data: { status: "PENDING" } });
      status = updated.status;
    }

    return NextResponse.json({
      proposal: { id, status },
      layersReady: allLayers.filter(
        (l) => l.creativeAssetData !== null || (l.creativeVideoData !== null && l.creativeCoverImageData !== null)
      ).length,
      layersTotal: allLayers.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
