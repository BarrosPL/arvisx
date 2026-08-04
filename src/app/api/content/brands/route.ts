import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getUserBrand } from "@/lib/content/access";
import { upsertBrandSchema } from "@/lib/content/schema";
import { textColorFor } from "@/lib/content/color";

const DEFAULT_NEUTRAL_DARK = "#111111";
const DEFAULT_NEUTRAL_LIGHT = "#F5F5F5";

export async function GET() {
  try {
    const user = await requireUser();
    const brand = await getUserBrand(user.id);
    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * V1 é preenchimento manual (sem extração automática do Instagram/site, F1.3 fica
 * pra depois) - "salvar" já ativa direto (isActive=true), diferente do fluxo de
 * revisão em duas etapas da spec (RF-1.5), que existe pra pegar erro de extração
 * AUTOMÁTICA. Aqui o próprio usuário digitou tudo, não tem "resultado de IA" pra
 * revisar - ativação em duas etapas seria fricção sem ganho real.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = upsertBrandSchema.parse(await request.json());

    const palette = {
      ...body.palette,
      neutralDark: DEFAULT_NEUTRAL_DARK,
      neutralLight: DEFAULT_NEUTRAL_LIGHT,
      textOnPrimary: textColorFor(body.palette.primary),
      textOnLight: textColorFor(DEFAULT_NEUTRAL_LIGHT),
    };

    const existing = await getUserBrand(user.id);
    const data = {
      name: body.name,
      logoUrl: body.logoUrl || null,
      palette,
      voiceTone: body.voiceTone || null,
      voiceAttributes: body.voiceAttributes,
      forbiddenTerms: body.forbiddenTerms,
      industry: body.industry || null,
      targetAudience: body.targetAudience || null,
      valueProposition: body.valueProposition || null,
      contentPillars: body.contentPillars,
      legalDisclaimer: body.legalDisclaimer || null,
      isActive: true,
    };

    const brand = existing
      ? await prisma.brand.update({ where: { id: existing.id }, data })
      : await prisma.brand.create({
          data: { ...data, ownerUserId: user.id, slug: `brand-${randomBytes(6).toString("hex")}` },
        });

    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}
