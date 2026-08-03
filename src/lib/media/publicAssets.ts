import { prisma } from "@/lib/prisma";

/**
 * Hospeda um blob publicamente, sem autenticacao, numa URL estavel - ver o comentario do
 * model PublicMediaAsset em schema.prisma pro motivo (thumbnail de anuncio em video
 * precisa de URL que a Meta consiga baixar por HTTP comum, sem token de sessao nosso).
 *
 * So existe este caminho de ESCRITA server-side (nao ha rota POST publica) - quem chama
 * isto e sempre codigo confiavel de dentro do servidor (ex: apos um humano anexar uma
 * imagem de capa numa proposta), nunca um cliente externo direto. Isso evita o proprio
 * mecanismo virar hospedagem publica de arquivo arbitrario.
 */
export async function storePublicImage(
  bytes: Buffer,
  mimeType: string
): Promise<{ id: string; publicUrl: string }> {
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    throw new Error("NEXTAUTH_URL nao configurada - impossivel montar uma URL publica");
  }

  const asset = await prisma.publicMediaAsset.create({
    data: { mimeType, data: new Uint8Array(bytes), byteLength: bytes.length },
    select: { id: true },
  });

  return { id: asset.id, publicUrl: `${baseUrl}/api/public/media/${asset.id}` };
}
