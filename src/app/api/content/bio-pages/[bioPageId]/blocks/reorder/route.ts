import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";
import { reorderBlocksSchema } from "@/lib/content/schema";

interface RouteParams {
  params: Promise<{ bioPageId: string }>;
}

/**
 * Reescreve TODAS as posicoes numa unica transacao - a constraint unique(bioPageId,
 * position) e DEFERRABLE INITIALLY DEFERRED (ver migration) justamente pra isso: sem
 * ela, trocar a posicao de dois blocos violaria a unicidade no meio do caminho (so e
 * reavaliada no COMMIT). `updateMany` com `bioPageId` no where evita que um id de bloco
 * de outra pagina (forjado no corpo) afete linha nenhuma.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    await requireBioPageAccess(bioPageId);
    const { order } = reorderBlocksSchema.parse(await request.json());

    const existing = await prisma.bioBlock.findMany({ where: { bioPageId }, select: { id: true } });
    const existingIds = new Set(existing.map((block) => block.id));
    if (order.length !== existing.length || !order.every((id) => existingIds.has(id))) {
      throw new Error("A lista de ordenação precisa conter exatamente os blocos existentes desta página");
    }

    await prisma.$transaction(
      order.map((blockId, index) =>
        prisma.bioBlock.updateMany({ where: { id: blockId, bioPageId }, data: { position: index } })
      )
    );

    const blocks = await prisma.bioBlock.findMany({ where: { bioPageId }, orderBy: { position: "asc" } });
    return NextResponse.json({ blocks });
  } catch (error) {
    return handleApiError(error);
  }
}
