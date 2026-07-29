import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 8 * 1024 * 1024;

const uploadSchema = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png"]),
});

/**
 * Unico jeito de uma proposta NEW_CAMPAIGN (Meta) sair de NEEDS_MORE_DATA - a JAMILE
 * nunca gera/promete a imagem do anuncio (ver campaignPlanSchema), so um humano anexa
 * ela aqui na revisao. NEW_CAMPAIGN no Google (Responsive Search Ad, so texto) nunca
 * passa por esta rota - ja nasce PENDING (ver dataEnforcement.ts).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id } });
    await requireBrandAccess(proposal.brandId, "MANAGER");

    if (proposal.type !== "NEW_CAMPAIGN") {
      throw new Error("Só propostas de campanha nova aceitam imagem de criativo");
    }
    if (proposal.status !== "NEEDS_MORE_DATA") {
      throw new Error(`Proposta precisa estar aguardando dado (está em ${proposal.status})`);
    }
    assertProposalTransition(proposal.status as ProposalStatus, "PENDING");

    const body = uploadSchema.parse(await request.json());
    if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
      throw new Error("Formato de imagem não suportado - use JPEG ou PNG");
    }

    const buffer = Buffer.from(body.dataBase64, "base64");
    if (buffer.length === 0) {
      throw new Error("Imagem vazia");
    }
    if (buffer.length > MAX_BYTES) {
      throw new Error("Imagem muito grande - limite de 8MB");
    }

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        creativeAssetData: buffer,
        creativeAssetMimeType: body.mimeType,
        status: "PENDING",
      },
    });

    return NextResponse.json({ proposal: { id: updated.id, status: updated.status } });
  } catch (error) {
    return handleApiError(error);
  }
}
