import { randomBytes } from "crypto";
import { textColorFor } from "./color";
import type { UpsertBrandInput } from "./schema";

const DEFAULT_NEUTRAL_DARK = "#111111";
const DEFAULT_NEUTRAL_LIGHT = "#F5F5F5";

/** Gera um slug único o bastante sem precisar consultar o banco - mesmo padrão já
 * usado antes de multi-marca existir, só reaproveitado aqui num lugar compartilhado. */
export function randomBrandSlug(): string {
  return `brand-${randomBytes(6).toString("hex")}`;
}

/**
 * Monta o objeto de dados pro Prisma a partir do payload validado - compartilhado
 * entre criar (POST) e atualizar (PUT) uma marca, pra não duplicar o mapeamento de
 * paleta (textOnPrimary/textOnLight calculados por contraste, nunca escolhidos - F1.5)
 * em 2 lugares que podiam divergir.
 */
export function buildBrandWriteData(body: UpsertBrandInput) {
  const palette = {
    ...body.palette,
    neutralDark: DEFAULT_NEUTRAL_DARK,
    neutralLight: DEFAULT_NEUTRAL_LIGHT,
    textOnPrimary: textColorFor(body.palette.primary),
    textOnLight: textColorFor(DEFAULT_NEUTRAL_LIGHT),
  };

  return {
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
    primaryGoal: body.primaryGoal || null,
    country: body.country,
    visualStyleDescription: body.visualStyleDescription || null,
    isActive: true,
  };
}
