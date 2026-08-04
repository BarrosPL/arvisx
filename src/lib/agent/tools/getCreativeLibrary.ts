import { prisma } from "@/lib/prisma";
import type { GetCreativeLibraryArgs } from "@/lib/agent/schema";

/**
 * Le o banco de criativos por produto/gancho (spec secao 3, so catalogo por enquanto -
 * ver CreativeLibraryAsset no schema.prisma). Existe pra JAMILE conseguir apontar
 * lacunas de cobertura Fria/Morna/Quente por gancho antes de propor uma campanha nova,
 * NUNCA pra reaproveitar o arquivo numa proposta (isso nao foi integrado de proposito).
 */
export async function getCreativeLibrary(credentialId: string, args: GetCreativeLibraryArgs) {
  const assets = await prisma.creativeLibraryAsset.findMany({
    where: {
      credentialId,
      ...(args.productName ? { productName: { contains: args.productName, mode: "insensitive" } } : {}),
      ...(args.hook ? { hook: { contains: args.hook, mode: "insensitive" } } : {}),
    },
    orderBy: [{ productName: "asc" }, { hook: "asc" }],
    select: {
      productName: true,
      hook: true,
      funnelStage: true,
      label: true,
      creativeVideoMimeType: true,
      createdAt: true,
    },
  });

  return {
    count: assets.length,
    assets: assets.map((asset) => ({
      productName: asset.productName,
      hook: asset.hook,
      funnelStage: asset.funnelStage,
      label: asset.label,
      kind: asset.creativeVideoMimeType ? "VIDEO" : "IMAGE",
      createdAt: asset.createdAt.toISOString(),
    })),
  };
}
