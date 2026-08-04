import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { listUserBrands } from "@/lib/content/access";
import { buildContentSystemPrompt } from "./persona";
import { CONTENT_TOOL_DEFS, dispatchContentTool } from "./tools";
import type { ContentMessage, ContentMessageRole } from "@/generated/prisma/client";

// So 1 tool existe nesta fatia (generate_content) - bem menor que o MAX_ITERATIONS da
// JAMILE (8, que precisa de varias consultas encadeadas antes de agir).
const MAX_ITERATIONS = 4;

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function mapHistoryToOpenAi(messages: ContentMessage[]): ChatCompletionMessageParam[] {
  return messages
    .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
    .map((message) =>
      message.role === "USER" ? { role: "user" as const, content: message.content } : { role: "assistant" as const, content: message.content },
    );
}

/**
 * Roda um turno completo do agente de conteúdo: carrega a marca ativa do usuário ->
 * loop de tool-calling (só "generate_content" nesta fatia) -> resposta final. Sem
 * resumo cumulativo de contexto (contextSummary da JAMILE) nesta rodada - o histórico
 * completo (verbatim) é bem mais curto aqui (gerar uma peça é 1-2 turnos, não dezenas
 * de consultas encadeadas), YAGNI até virar um problema real.
 */
export async function runContentAgentTurn(threadId: string, userText: string): Promise<ContentMessage[]> {
  const thread = await prisma.contentThread.findUniqueOrThrow({ where: { id: threadId } });

  const userMessage = await prisma.contentMessage.create({
    data: { threadId, role: "USER", content: userText },
  });

  const brands = await listUserBrands(thread.userId);
  const allowedBrandIds = new Set(brands.map((brand) => brand.id));

  const history = await prisma.contentMessage.findMany({
    where: { threadId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "asc" },
  });

  // Reforço "just-in-time" logo antes da geração, além da regra já no system prompt
  // (persona.ts) - achado real em teste ao vivo: um lembrete SÓ no topo da conversa
  // perde força depois de alguns turnos (o modelo passa a só confirmar em texto sem
  // chamar a ferramenta de novo); repetir bem perto do turno atual mitiga isso. Só
  // injeta quando já existe alguma peça nesta thread - sem isso, o lembrete não tem
  // "o quê" revisar e só ocuparia espaço à toa.
  const hasExistingPiece = history.some((message) => message.contentId);
  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildContentSystemPrompt(brands) },
    ...mapHistoryToOpenAi(history),
    ...(hasExistingPiece
      ? [
          {
            role: "system" as const,
            content:
              'Lembrete: se o pedido do usuário acima for qualquer alteração numa peça já gerada (texto, tamanho, cor - por menor que pareça), chame "revise_content" agora, de verdade - nunca responda confirmando uma mudança sem ter chamado a ferramenta neste turno.',
          },
        ]
      : []),
  ];

  const toolMessages: ContentMessage[] = [];
  const ctx = { userId: thread.userId, threadId, allowedBrandIds };
  let finalText: string | null = null;
  let generatedContentId: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages: openaiMessages,
      tools: CONTENT_TOOL_DEFS,
    });

    const message = completion.choices[0].message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      finalText = message.content ?? "";
      break;
    }

    openaiMessages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;

      const result = await dispatchContentTool(toolCall.function.name, toolCall.function.arguments, ctx);
      const resultJson = JSON.parse(JSON.stringify(result)) as { ok: boolean; contentId?: string };
      if (resultJson.ok && resultJson.contentId) generatedContentId = resultJson.contentId;

      const toolMessage = await prisma.contentMessage.create({
        data: {
          threadId,
          role: "TOOL",
          content: JSON.stringify(result),
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          toolArgsJson: JSON.parse(JSON.stringify(safeJsonParse(toolCall.function.arguments))),
          toolResultJson: resultJson,
          contentId: resultJson.ok ? (resultJson.contentId ?? null) : null,
        },
      });
      toolMessages.push(toolMessage);

      openaiMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }

  if (finalText === null) {
    const fallback = await openai.chat.completions.create({ model: AGENT_MODEL, messages: openaiMessages });
    finalText = fallback.choices[0]?.message.content ?? "Não consegui concluir agora - tente de novo em instantes.";
  }

  const assistantMessage = await prisma.contentMessage.create({
    data: { threadId, role: "ASSISTANT", content: finalText, contentId: generatedContentId },
  });

  await prisma.contentThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });

  return [userMessage, ...toolMessages, assistantMessage];
}

export interface ContentChatMessageView {
  id: string;
  role: ContentMessageRole;
  content: string;
  toolName: string | null;
  contentId: string | null;
  createdAt: string;
}

export function toContentChatMessageViews(messages: ContentMessage[]): ContentChatMessageView[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    toolName: message.toolName,
    contentId: message.contentId,
    createdAt: message.createdAt.toISOString(),
  }));
}
