import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import { generateContent, BrandNotConfiguredError, ComplianceViolationError } from "@/lib/content/generate";
import { reviseContent } from "@/lib/content/revise";
import { generateContentArgsSchema, reviseContentArgsSchema } from "./schema";

export const CONTENT_TOOL_DEFS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "generate_content",
      description:
        "Gera uma peça de conteúdo (imagem) para redes sociais a partir de um pedido em linguagem natural, seguindo o Brand Kit ativo do usuário. A imagem gerada já aparece automaticamente pro usuário na conversa - não descreva a imagem em detalhe nem repita um link, só confirme brevemente o que foi feito.",
      parameters: {
        type: "object",
        properties: {
          brief: {
            type: "string",
            description: "O pedido do usuário, resumido/limpo se necessário (o assunto/tema da peça a gerar).",
          },
          formatId: {
            type: "string",
            enum: ["ig_feed_square", "ig_feed_portrait", "ig_story"],
            description:
              "Formato da peça. 'ig_feed_square' (padrão pra pedido genérico de post), 'ig_feed_portrait' (feed vertical/retrato) ou 'ig_story' (stories).",
          },
        },
        required: ["brief", "formatId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "revise_content",
      description:
        "Altera a ÚLTIMA peça gerada ou revisada nesta conversa, a partir de um pedido em português (ex: 'aumenta o título', 'muda a cor de fundo pra verde', 'troca o texto do botão pra Fale conosco'). Sempre revisa a peça mais recente do chat - nunca uma peça de outra conversa. A imagem atualizada já aparece automaticamente - só confirme brevemente o que mudou.",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description: "O pedido de alteração do usuário, em português, o mais próximo possível do que ele disse.",
          },
        },
        required: ["instruction"],
        additionalProperties: false,
      },
    },
  },
];

export interface ContentToolContext {
  userId: string;
  threadId: string;
}

/** Nunca deixa a tool call derrubar o turno inteiro (BrandNotConfiguredError/
 * ComplianceViolationError são esperáveis, não bugs) - devolve `ok:false` + mensagem
 * clara pro LLM explicar ao usuário, mesmo padrão de resultado estruturado que as
 * tools da JAMILE usam (nunca lança erro cru pro loop de tool-calling). */
export async function dispatchContentTool(name: string, argsJson: string, ctx: ContentToolContext): Promise<unknown> {
  if (name === "generate_content") return dispatchGenerate(argsJson, ctx);
  if (name === "revise_content") return dispatchRevise(argsJson, ctx);
  return { ok: false, error: `Ferramenta desconhecida: ${name}` };
}

async function dispatchGenerate(argsJson: string, ctx: ContentToolContext): Promise<unknown> {
  let args;
  try {
    args = generateContentArgsSchema.parse(JSON.parse(argsJson));
  } catch {
    return { ok: false, error: "Argumentos inválidos pra generate_content." };
  }

  try {
    const content = await generateContent({
      userId: ctx.userId,
      brief: args.brief,
      formatId: args.formatId,
      threadId: ctx.threadId,
    });
    return { ok: true, contentId: content.id, generation: content.generation };
  } catch (error) {
    if (error instanceof BrandNotConfiguredError || error instanceof ComplianceViolationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/** Acha a última peça tocada NESTA thread (gerada ou revisada) via ContentMessage.
 * contentId, em vez de pedir esse id pro LLM - ele não tem como saber/lembrar um cuid
 * de forma confiável, e "revisa a última coisa que você me mostrou" é o que o usuário
 * quer dizer na prática esmagadora dos casos. */
async function lastContentIdInThread(threadId: string): Promise<string | null> {
  const last = await prisma.contentMessage.findFirst({
    where: { threadId, contentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { contentId: true },
  });
  return last?.contentId ?? null;
}

async function dispatchRevise(argsJson: string, ctx: ContentToolContext): Promise<unknown> {
  let args;
  try {
    args = reviseContentArgsSchema.parse(JSON.parse(argsJson));
  } catch {
    return { ok: false, error: "Argumentos inválidos pra revise_content." };
  }

  const contentId = await lastContentIdInThread(ctx.threadId);
  if (!contentId) {
    return { ok: false, error: "Nenhuma peça foi gerada nesta conversa ainda - gere uma peça antes de pedir uma alteração." };
  }

  try {
    const { content, rejected, warnings } = await reviseContent({
      userId: ctx.userId,
      contentId,
      instruction: args.instruction,
    });
    return { ok: true, contentId: content.id, generation: content.generation, rejected, warnings };
  } catch (error) {
    if (error instanceof BrandNotConfiguredError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
