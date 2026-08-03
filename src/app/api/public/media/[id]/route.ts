import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Rota PUBLICA de proposito - sem requireUser/requireAccountAccess. E o unico jeito da
 * Meta conseguir baixar a thumbnail de um anuncio em video (video_data.image_url exige
 * URL publica de verdade, sem token de sessao nosso - ver PublicMediaAsset no
 * schema.prisma e storePublicImage em lib/media/publicAssets.ts).
 *
 * Seguro apesar de publica: so leitura por id exato (cuid, 128 bits - impraticavel de
 * adivinhar), sem endpoint de listagem, e sem rota de escrita publica correspondente
 * (o unico jeito de um registro existir aqui e codigo server-side confiavel ter chamado
 * storePublicImage). Cache-Control longo porque o conteudo e imutavel: um id novo e
 * sempre criado pra um upload novo, nunca sobrescreve um existente.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const asset = await prisma.publicMediaAsset.findUnique({
    where: { id },
    select: { data: true, mimeType: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
