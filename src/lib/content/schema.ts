import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor precisa ser hex de 6 dígitos (#RRGGBB)");

/** Só as 3 cores "de opinião" vêm do usuário - textOnPrimary/textOnLight são
 * calculadas por contraste (lib/content/color.ts), neutralDark/neutralLight têm
 * default sensato (não expostos no formulário ainda, sem necessidade de UI extra). */
export const brandPaletteInputSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
});

export type BrandPaletteInput = z.infer<typeof brandPaletteInputSchema>;

export const upsertBrandSchema = z.object({
  name: z.string().trim().min(1).max(100),
  logoUrl: z.string().url().optional().nullable(),
  palette: brandPaletteInputSchema,
  voiceTone: z.string().trim().max(200).optional(),
  voiceAttributes: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  forbiddenTerms: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  industry: z.string().trim().max(100).optional(),
  targetAudience: z.string().trim().max(300).optional(),
  valueProposition: z.string().trim().max(300).optional(),
  contentPillars: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  legalDisclaimer: z.string().trim().max(500).optional(),
});

export type UpsertBrandInput = z.infer<typeof upsertBrandSchema>;

/**
 * Contrato F2.3 da spec - saída estruturada do LLM pra uma peça de conteúdo. `hook`
 * alimenta o slot "eyebrow" dos templates (ver SLOT_COPY_SOURCE em render/resolveScene.ts);
 * `bodyPoints`/`caption`/`hashtags`/`altText` não têm slot visual no template
 * "capa_simples" atual (só existe headline/subheadline/cta) - ficam gravados em
 * `Content.generation` mesmo assim, prontos pro texto do post e pra quando existirem
 * templates com mais slots. Sem `.optional()`/`.default()` de propósito - structured
 * output da OpenAI em modo strict exige todo campo presente, sempre.
 */
export const generationOutputSchema = z.object({
  archetype: z.string().trim().min(1).max(60),
  hook: z.string().trim().min(1).max(60),
  headline: z.string().trim().min(1).max(140),
  subheadline: z.string().trim().min(1).max(200),
  bodyPoints: z.array(z.string().trim().min(1).max(160)).max(5),
  cta: z.string().trim().min(1).max(40),
  caption: z.string().trim().min(1).max(2200),
  hashtags: z.array(z.string().trim().min(1).max(40)).max(15),
  altText: z.string().trim().min(1).max(300),
});

export type GenerationOutput = z.infer<typeof generationOutputSchema>;

/**
 * Subconjunto do `EditCommand` da spec (F4.2) que faz sentido pra arquitetura atual
 * (sem canvas, sem camadas/z-order, sem imagem/logo em nenhum slot ainda) - cortados
 * de propósito nesta rodada: `setImage` (nenhum template tem slot de imagem),
 * `reorderLayer` (layout é flexbox em fluxo normal, não existe z-order livre pra
 * reordenar), `swapTemplate` (trocaria o conjunto de slots inteiro - complexidade de
 * UX própria, fica pra outra rodada), `applyToAll` (não existe lote/carrossel, é uma
 * peça por vez). `fontWeight` só aceita 400/700 porque são as duas ÚNICAS fontes
 * carregadas (Inter Regular/Bold, ver render/fonts.ts) - pedir outro peso quebraria o
 * render. Campos de `setStyle` são `nullable()` (não `.optional()`) porque a saída
 * estruturada da OpenAI em modo strict exige todo campo presente - null é como o LLM
 * diz "não mexer nisso".
 */
export const editCommandSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("setText"),
    slotKey: z.string().trim().min(1).max(40),
    value: z.string().trim().min(1).max(300),
  }),
  z.object({
    op: z.literal("setStyle"),
    slotKey: z.string().trim().min(1).max(40),
    fontSize: z.number().min(8).max(200).nullable(),
    fill: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
    fontWeight: z.union([z.literal(400), z.literal(700)]).nullable(),
    opacity: z.number().min(0).max(1).nullable(),
  }),
  z.object({
    op: z.literal("setPalette"),
    role: z.enum(["primary", "secondary", "accent"]),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
]);

export type EditCommand = z.infer<typeof editCommandSchema>;

export const editCommandListSchema = z.object({
  commands: z.array(editCommandSchema).min(1).max(10),
});

export type EditCommandList = z.infer<typeof editCommandListSchema>;
