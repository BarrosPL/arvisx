import { zodResponseFormat } from "openai/helpers/zod";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import type { Brand, Content } from "@/generated/prisma/client";
import { getUserBrand } from "./access";
import { findComplianceViolations } from "./compliance";
import { generationOutputSchema, type GenerationOutput } from "./schema";
import { resolveScene } from "./render/resolveScene";
import type { SlotConstraints } from "./render/autoFit";
import { renderScene } from "./render/renderScene";

export class BrandNotConfiguredError extends Error {
  constructor() {
    super("Configure e ative sua marca antes de gerar conteúdo.");
    this.name = "BrandNotConfiguredError";
  }
}

export class ComplianceViolationError extends Error {
  constructor(public readonly violations: string[]) {
    super(`A geração violou regras da marca mesmo após nova tentativa: ${violations.join("; ")}`);
    this.name = "ComplianceViolationError";
  }
}

export interface GenerateContentInput {
  userId: string;
  brief: string;
  formatId: string;
  threadId?: string;
}

function buildSystemPrompt(brand: Brand, slots: Record<string, SlotConstraints>): string {
  const slotLimits = Object.entries(slots)
    .map(([key, c]) => `- ${key}: no máximo ${c.maxChars} caracteres, ${c.maxLines} linha(s)`)
    .join("\n");

  return `Você é o redator de conteúdo para redes sociais da marca "${brand.name}".
Setor: ${brand.industry ?? "não informado"}.
Público-alvo: ${brand.targetAudience ?? "não informado"}.
Proposta de valor: ${brand.valueProposition ?? "não informado"}.
Tom de voz: ${brand.voiceTone ?? "profissional e direto"}. Atributos de voz: ${brand.voiceAttributes.join(", ") || "nenhum em especial"}.
Pilares de conteúdo da marca: ${brand.contentPillars.join(", ") || "nenhum definido"}.

REGRAS OBRIGATÓRIAS:
- Nunca use, em nenhuma forma ou variação, estes termos proibidos: ${brand.forbiddenTerms.join(", ") || "nenhum"}.
- NUNCA prometa resultado garantido, prazo específico (ex: "em 6 meses"), percentual de sucesso/aprovação ou ausência de risco. Fale de forma realista e responsável.
${brand.legalDisclaimer ? `- Contexto legal da marca (não cite verbatim, mas respeite): ${brand.legalDisclaimer}` : ""}

Gere uma peça de conteúdo para uma imagem com estes limites de espaço - respeite rigorosamente, texto além do limite será cortado:
${slotLimits}

Responda sempre em português do Brasil.`;
}

async function requestGeneration(
  brief: string,
  brand: Brand,
  slots: Record<string, SlotConstraints>,
  priorViolations?: string[],
): Promise<GenerationOutput> {
  const userPrompt = priorViolations
    ? `${brief}\n\nAtenção: a geração anterior violou regras da marca (${priorViolations.join("; ")}). Gere de novo respeitando estritamente os termos proibidos e sem prometer resultado ou prazo.`
    : brief;

  const completion = await openai.chat.completions.parse({
    model: AGENT_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(brand, slots) },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(generationOutputSchema, "content_generation"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("A IA não retornou uma geração válida.");
  return parsed;
}

/**
 * Pipeline completo da F2 (Fatia 5 do plano): LLM com saída estruturada -> validação
 * de compliance determinística (regenera 1x se bater) -> escolhe template -> resolve
 * cena (tokens de marca + copy nos slots + autoFit) -> renderiza -> grava `Content`.
 * Sem geração de imagem de fundo por IA nesta rodada - o fundo vem da paleta da marca
 * via token, já resolvido em resolveScene.
 */
export async function generateContent(input: GenerateContentInput): Promise<Content> {
  const brand = await getUserBrand(input.userId);
  if (!brand || !brand.isActive) throw new BrandNotConfiguredError();

  const format = await prisma.format.findUnique({ where: { id: input.formatId } });
  if (!format) throw new Error(`Formato desconhecido: ${input.formatId}`);

  const template = await prisma.template.findFirst({ where: { formatId: format.id } });
  if (!template) throw new Error(`Nenhum template disponível para o formato ${format.id}`);

  const slots = template.slots as unknown as Record<string, SlotConstraints>;

  let output = await requestGeneration(input.brief, brand, slots);
  let violations = findComplianceViolations(output, brand);
  if (violations.length > 0) {
    output = await requestGeneration(input.brief, brand, slots, violations);
    violations = findComplianceViolations(output, brand);
    if (violations.length > 0) throw new ComplianceViolationError(violations);
  }

  const scene = resolveScene(template, brand.palette as Record<string, string>, format, output);
  const imageData = await renderScene(scene, format.width, format.height);

  return prisma.content.create({
    data: {
      brandId: brand.id,
      formatId: format.id,
      templateId: template.id,
      brief: input.brief,
      generation: output as unknown as object,
      scene: scene as unknown as object,
      imageData: new Uint8Array(imageData),
      threadId: input.threadId ?? null,
    },
  });
}
