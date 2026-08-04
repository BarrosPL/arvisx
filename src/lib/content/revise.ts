import { zodResponseFormat } from "openai/helpers/zod";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import type { Content } from "@/generated/prisma/client";
import { assertContentAccess } from "./access";
import { contrastRatio } from "./color";
import { editCommandListSchema, type EditCommand, type GenerationOutput } from "./schema";
import { cloneScene, findSlotNodes, type SceneNode } from "./render/scene";
import { resolveScene, applyStyleOverrides, SLOT_COPY_SOURCE, SLOT_BACKGROUND_HEX } from "./render/resolveScene";
import { renderScene } from "./render/renderScene";
import { textColorFor } from "./color";
import type { SlotConstraints } from "./render/autoFit";

export interface ReviseContentInput {
  userId: string;
  contentId: string;
  instruction: string;
}

export interface ReviseContentResult {
  content: Content;
  /** Comandos recusados (ex: slot brandLocked) - F4.3 da spec. */
  rejected: string[];
  /** Avisos não-bloqueantes (contraste baixo, fontSize fora do limite e já clampado). */
  warnings: string[];
}

function buildRevisionSystemPrompt(generation: GenerationOutput, slots: Record<string, SlotConstraints>): string {
  const slotList = Object.entries(slots)
    .map(([key, c]) => `- "${key}": no máximo ${c.maxChars} caracteres, ${c.maxLines} linha(s), fonte entre ${c.minFontSize}px e ${c.maxFontSize}px`)
    .join("\n");

  return `Você edita uma peça de conteúdo já gerada, a partir de um pedido em português do usuário. Emita só os comandos necessários pra cumprir exatamente o que foi pedido - nunca reescreva campos que o usuário não mencionou.

Texto atual de cada campo da peça: ${JSON.stringify(generation)}

Slots visuais existentes (use este "slotKey" exato em setText/setStyle):
${slotList}

Comandos disponíveis:
- setText: troca o texto de um slot (o campo correspondente da peça muda junto).
- setStyle: muda tamanho de fonte (fontSize), cor do texto (fill, hex), peso (fontWeight, só 400 ou 700) ou opacidade (opacity, 0 a 1) de um slot - preencha só os campos que o usuário pediu, deixe os outros null.
- setPalette: muda uma cor da marca (role: primary/secondary/accent) só nesta peça, sem alterar a marca em si.

Se o pedido for ambíguo sobre QUAL slot (ex: "aumenta o texto" sem dizer qual), prefira o "headline" - é o elemento mais proeminente. Se o pedido mencionar cor de fundo, use setPalette com role "primary".`;
}

async function requestEditCommands(generation: GenerationOutput, slots: Record<string, SlotConstraints>, instruction: string): Promise<EditCommand[]> {
  const completion = await openai.chat.completions.parse({
    model: AGENT_MODEL,
    messages: [
      { role: "system", content: buildRevisionSystemPrompt(generation, slots) },
      { role: "user", content: instruction },
    ],
    response_format: zodResponseFormat(editCommandListSchema, "edit_commands"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("A IA não retornou comandos de edição válidos.");
  return parsed.commands;
}

/**
 * Revisão conversacional (F4.2/F4.3 da spec, adaptado pra chat-só - Fatia 7 do plano):
 * LLM emite `EditCommand[]` tipado a partir do pedido em português -> guards (F4.3) ->
 * aplica (texto muda `generation`, estilo/paleta viram overrides acumulados) -> resolve
 * a cena do zero (mesma função da geração original) -> aplica os overrides de estilo
 * por cima -> re-renderiza -> sobrescreve `Content` no lugar (sem histórico de versão,
 * mesma decisão já tomada na Fatia 2 - não existe editor visual pra "desfazer" ali).
 */
export async function reviseContent(input: ReviseContentInput): Promise<ReviseContentResult> {
  const content = await assertContentAccess(input.userId, input.contentId);
  const [brand, format, template] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: content.brandId } }),
    prisma.format.findUniqueOrThrow({ where: { id: content.formatId } }),
    prisma.template.findUniqueOrThrow({ where: { id: content.templateId } }),
  ]);

  const slots = template.slots as unknown as Record<string, SlotConstraints>;
  const generation = { ...(content.generation as unknown as GenerationOutput) };
  const styleOverrides: Record<string, Record<string, number | string>> = {
    ...((content.styleOverrides as Record<string, Record<string, number | string>> | null) ?? {}),
  };
  const paletteOverrides: Record<string, string> = {
    ...((content.paletteOverrides as Record<string, string> | null) ?? {}),
  };

  const lockedSlots = new Set(
    findSlotNodes(cloneScene(template.sceneJson as unknown as SceneNode))
      .filter((node) => node.brandLocked)
      .map((node) => node.slotKey!),
  );

  const commands = await requestEditCommands(generation, slots, input.instruction);

  const rejected: string[] = [];
  const warnings: string[] = [];

  for (const command of commands) {
    if ((command.op === "setText" || command.op === "setStyle") && lockedSlots.has(command.slotKey)) {
      rejected.push(`"${command.slotKey}" é um elemento fixo da marca e não pode ser alterado.`);
      continue;
    }

    if (command.op === "setText") {
      const field = SLOT_COPY_SOURCE[command.slotKey];
      if (!field) {
        rejected.push(`Slot desconhecido: "${command.slotKey}".`);
        continue;
      }
      generation[field] = command.value;
      continue;
    }

    if (command.op === "setStyle") {
      const constraints = slots[command.slotKey];
      if (!constraints) {
        rejected.push(`Slot desconhecido: "${command.slotKey}".`);
        continue;
      }

      const props: Record<string, number | string> = {};

      if (command.fontSize !== null) {
        const clamped = Math.min(constraints.maxFontSize, Math.max(constraints.minFontSize, command.fontSize));
        if (clamped !== command.fontSize) {
          warnings.push(`Tamanho de fonte de "${command.slotKey}" ajustado para ${clamped}px (limite do slot é ${constraints.minFontSize}-${constraints.maxFontSize}px).`);
        }
        props.fontSize = clamped;
      }
      if (command.fill !== null) {
        const backgroundRole = SLOT_BACKGROUND_HEX[command.slotKey];
        const backgroundHex = backgroundRole === "white" ? "#FFFFFF" : (paletteOverrides.primary ?? (brand.palette as Record<string, string>).primary);
        if (backgroundHex) {
          const ratio = contrastRatio(command.fill, backgroundHex);
          if (ratio < 4.5) {
            warnings.push(`A cor escolhida para "${command.slotKey}" tem contraste baixo (${ratio.toFixed(1)}:1) contra o fundo - pode ficar difícil de ler.`);
          }
        }
        // O comando usa "fill" (nome da spec F4.2, pensado pra um canvas tipo
        // Fabric.js) mas o Satori (nosso renderer real) usa a propriedade CSS "color"
        // pra cor de texto - "fill" é atributo de shape/SVG e não tem efeito nenhum
        // em texto aqui (achado real em teste ao vivo: o override gravava certo no
        // banco mas a imagem renderizada nunca mudava de cor).
        props.color = command.fill;
      }
      if (command.fontWeight !== null) props.fontWeight = command.fontWeight;
      if (command.opacity !== null) props.opacity = command.opacity;

      if (Object.keys(props).length === 0) {
        rejected.push(`Comando de estilo para "${command.slotKey}" veio sem nenhuma mudança válida.`);
        continue;
      }

      styleOverrides[command.slotKey] = { ...styleOverrides[command.slotKey], ...props };
      continue;
    }

    if (command.op === "setPalette") {
      paletteOverrides[command.role] = command.hex;
      // A cor de texto sobre o fundo (F1.5: "calculado por contraste, nunca escolhido")
      // é derivada de `primary` - sem recalcular aqui, trocar o fundo por overide
      // podia deixar o headline (branco/preto fixo da marca ORIGINAL) ilegível sobre a
      // nova cor.
      if (command.role === "primary") {
        paletteOverrides.textOnPrimary = textColorFor(command.hex);
      }
      continue;
    }
  }

  const effectivePalette = { ...(brand.palette as Record<string, string>), ...paletteOverrides };
  const scene = resolveScene(template, effectivePalette, format, generation);
  applyStyleOverrides(scene, styleOverrides);

  const imageData = await renderScene(scene, format.width, format.height);

  const updated = await prisma.content.update({
    where: { id: content.id },
    data: {
      generation: generation as unknown as object,
      scene: scene as unknown as object,
      imageData: new Uint8Array(imageData),
      paletteOverrides,
      styleOverrides,
    },
  });

  return { content: updated, rejected, warnings };
}
