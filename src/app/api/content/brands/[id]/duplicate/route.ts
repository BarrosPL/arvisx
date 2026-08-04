import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { assertBrandAccess } from "@/lib/content/access";
import { handleApiError } from "@/lib/http";
import { randomBrandSlug } from "@/lib/content/brandData";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Duplica uma marca ("Duplicar" no Gerenciar Marcas) - cópia nasce INATIVA
 * (isActive=false), mesma regra de "salvar" precisar de uma revisão explícita antes
 * de virar utilizável na geração - aqui faz mais sentido que nascer ativa direto,
 * porque o usuário pode querer editar antes de ativar (ex: cor diferente pra um
 * sub-produto da mesma marca). */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const original = await assertBrandAccess(user.id, id);

    const brand = await prisma.brand.create({
      data: {
        ownerUserId: user.id,
        slug: randomBrandSlug(),
        name: `${original.name} (cópia)`,
        logoUrl: original.logoUrl,
        palette: original.palette as object,
        headingFontId: original.headingFontId,
        bodyFontId: original.bodyFontId,
        voiceTone: original.voiceTone,
        voiceAttributes: original.voiceAttributes,
        forbiddenTerms: original.forbiddenTerms,
        // Prisma exige o sentinel JsonNull pra Json nullable - `null` cru é ambíguo
        // (SQL NULL vs valor JSON "null") e o client rejeita o tipo em compile-time.
        mandatoryTerms: original.mandatoryTerms === null ? Prisma.JsonNull : (original.mandatoryTerms as Prisma.InputJsonValue),
        industry: original.industry,
        targetAudience: original.targetAudience,
        valueProposition: original.valueProposition,
        contentPillars: original.contentPillars,
        legalDisclaimer: original.legalDisclaimer,
        primaryGoal: original.primaryGoal,
        country: original.country,
        visualStyleDescription: original.visualStyleDescription,
        isActive: false,
      },
    });

    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}
