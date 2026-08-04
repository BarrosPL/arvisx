import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { assertBrandAccess } from "@/lib/content/access";
import { handleApiError } from "@/lib/http";
import { upsertBrandSchema } from "@/lib/content/schema";
import { buildBrandWriteData } from "@/lib/content/brandData";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Atualiza uma marca existente ("Editar" no Gerenciar Marcas) - checa posse antes de
 * escrever, mesmo padrão de qualquer outra rota que mexe num recurso por id. */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertBrandAccess(user.id, id);

    const body = upsertBrandSchema.parse(await request.json());
    const brand = await prisma.brand.update({ where: { id }, data: buildBrandWriteData(body) });

    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({ isActive: z.boolean() });

/** Alterna só `isActive` ("Arquivar" no Gerenciar Marcas) - rota separada do PUT de
 * propósito: PUT é o "Salvar" do wizard inteiro e sempre ativa (`buildBrandWriteData`
 * força `isActive: true`, mesma regra de sempre - quem preencheu foi o próprio
 * usuário, salvar já é intenção de ativar). Arquivar é uma ação isolada, sem passar
 * pelo formulário completo, então precisa do próprio verbo pra não reativar por
 * engano nem exigir o payload inteiro só pra desligar um campo. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertBrandAccess(user.id, id);

    const body = patchSchema.parse(await request.json());
    const brand = await prisma.brand.update({ where: { id }, data: { isActive: body.isActive } });

    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Apaga uma marca de vez - `Content.brandId` tem `onDelete: Cascade` (ver
 * schema.prisma), então apagar a marca já limpa todo o conteúdo gerado dela junto,
 * comportamento esperado (não faz sentido conteúdo órfão sem marca dona). */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertBrandAccess(user.id, id);

    await prisma.brand.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
