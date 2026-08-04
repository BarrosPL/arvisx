import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { listUserBrands } from "@/lib/content/access";
import { upsertBrandSchema } from "@/lib/content/schema";
import { buildBrandWriteData, randomBrandSlug } from "@/lib/content/brandData";

export async function GET() {
  try {
    const user = await requireUser();
    const brands = await listUserBrands(user.id);
    return NextResponse.json({ brands });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Cria uma marca NOVA (multi-marca - "+ Nova Marca" no Gerenciar Marcas) - sempre
 * INSERT, nunca upsert (diferente da versão de marca única antiga, que decidia
 * criar/atualizar sozinha). Atualizar uma marca existente é `PUT /[id]`.
 * "Salvar" já ativa direto (isActive=true) - preenchimento é sempre do próprio
 * usuário (manual ou revisado a partir da extração por imagem), nunca um resultado de
 * IA não revisado, então não há motivo pra uma tela de revisão em duas etapas (RF-1.5
 * existe pra pegar erro de extração AUTOMÁTICA, que não é o caso aqui).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = upsertBrandSchema.parse(await request.json());

    const brand = await prisma.brand.create({
      data: { ...buildBrandWriteData(body), ownerUserId: user.id, slug: randomBrandSlug() },
    });

    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}
