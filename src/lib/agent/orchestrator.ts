import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { buildSystemPrompt } from "@/lib/agent/persona";
import { TOOL_DEFS, dispatchTool } from "@/lib/agent/tools";
import { validateInbound, validateOutbound } from "@/lib/brands/firewall";
import type { Message } from "@/generated/prisma/client";

const MAX_ITERATIONS = 8;

const FIREWALL_INBOUND_REFUSAL =
  "Essa pergunta toca em um tema de outra marca do grupo, então não posso responder por aqui. Se for sobre outro negócio, procure a JAMILE na marca correspondente.";

const FIREWALL_OUTBOUND_FALLBACK =
  "Não consigo compartilhar essa resposta porque ela tocaria em outra marca do grupo. Pode reformular a pergunta focando só nesta marca?";

/** Uma marca tem uma unica conversa continua com a JAMILE - cria na primeira mensagem. */
export async function getOrCreateBrandThread(brandId: string, userId: string) {
  const existing = await prisma.conversationThread.findFirst({
    where: { brandId, userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.conversationThread.create({ data: { brandId, userId } });
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

/**
 * So reconstroi USER/ASSISTANT no historico entre turnos - o vai-e-vem de tool calls fica
 * de fora porque a resposta final do assistente ja resume o que foi encontrado. Isso evita
 * ter que reconstruir pares assistant(tool_calls)/tool com IDs validos entre turnos.
 */
function mapHistoryToOpenAi(messages: Message[]): ChatCompletionMessageParam[] {
  return messages
    .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
    .map((message) =>
      message.role === "USER"
        ? { role: "user" as const, content: message.content }
        : { role: "assistant" as const, content: message.content }
    );
}

/**
 * Roda um turno completo do agente: valida entrada -> loop de tool-calling -> valida saida.
 * Toda saida do fluxo grava uma Message(ASSISTANT) - nao existe caminho de silencio.
 */
export async function runAgentTurn(threadId: string, userText: string): Promise<Message[]> {
  const thread = await prisma.conversationThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { brand: true },
  });

  const userMessage = await prisma.message.create({
    data: { threadId, role: "USER", content: userText },
  });

  const firewallBrand = { id: thread.brand.id, excludedKeywords: thread.brand.excludedKeywords };
  const firewallIn = await validateInbound(firewallBrand, userText);

  if (!firewallIn.allowed) {
    const refusal = await prisma.message.create({
      data: { threadId, role: "ASSISTANT", content: FIREWALL_INBOUND_REFUSAL },
    });
    await prisma.conversationThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
    return [userMessage, refusal];
  }

  const history = await prisma.message.findMany({ where: { threadId }, orderBy: { createdAt: "asc" } });

  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(thread.brand) },
    ...mapHistoryToOpenAi(history),
  ];

  const toolMessages: Message[] = [];
  const ctx = { brandId: thread.brandId, threadId };
  let finalText: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages: openaiMessages,
      tools: TOOL_DEFS,
    });

    const message = completion.choices[0].message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      finalText = message.content ?? "";
      break;
    }

    openaiMessages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;

      const result = await dispatchTool(toolCall.function.name, toolCall.function.arguments, ctx);
      const resultJson = JSON.parse(JSON.stringify(result));

      const toolMessage = await prisma.message.create({
        data: {
          threadId,
          role: "TOOL",
          content: JSON.stringify(result),
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          toolArgsJson: JSON.parse(JSON.stringify(safeJsonParse(toolCall.function.arguments))),
          toolResultJson: resultJson,
        },
      });
      toolMessages.push(toolMessage);

      openaiMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }

  if (finalText === null) {
    const fallback = await openai.chat.completions.create({ model: AGENT_MODEL, messages: openaiMessages });
    finalText = fallback.choices[0]?.message.content ?? "Não consegui concluir a análise agora - tente novamente em instantes.";
  }

  const firewallOut = await validateOutbound(firewallBrand, finalText);
  const safeFinalText = firewallOut.allowed ? finalText : FIREWALL_OUTBOUND_FALLBACK;

  const assistantMessage = await prisma.message.create({
    data: { threadId, role: "ASSISTANT", content: safeFinalText },
  });

  await prisma.conversationThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });

  return [userMessage, ...toolMessages, assistantMessage];
}
