import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { buildUserScopedSystemPrompt } from "@/lib/agent/persona";
import { TOOL_DEFS_CHAT, dispatchChatTool, extractAccountIdFromArgs, type ChatToolContext } from "@/lib/agent/tools";
import type { Message } from "@/generated/prisma/client";

const MAX_ITERATIONS = 8;
const MAX_HISTORY_MESSAGES = 40;

/** Uma unica conversa continua por usuario - cria na primeira mensagem. */
export async function getOrCreateUserThread(userId: string) {
  return prisma.conversationThread.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
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
 * Roda um turno completo do agente: carrega as marcas do usuario -> loop de
 * tool-calling (cada chamada escolhe/valida sua propria marca) -> resposta final.
 * Toda saida do fluxo grava uma Message(ASSISTANT) - nao existe caminho de silencio.
 *
 * Isolamento entre contas: nao existe um "accountId" fixo pro turno inteiro (o chat e
 * por usuario, pode falar de varias contas na mesma conversa/mensagem). A garantia real
 * - conta X nunca ve dado da conta Y - vem de dispatchChatTool validar o accountId de
 * CADA chamada contra a lista real de contas do usuario (assertAccountAccess em
 * agent/tools/index.ts) antes de ler/escrever qualquer coisa. Isso e imposto em codigo,
 * no ponto exato onde o dado e acessado.
 */
export async function runAgentTurn(threadId: string, userText: string): Promise<Message[]> {
  const thread = await prisma.conversationThread.findUniqueOrThrow({
    where: { id: threadId },
  });

  const userMessage = await prisma.message.create({
    data: { threadId, role: "USER", content: userText },
  });

  const accounts = await prisma.adCredential.findMany({
    where: { providerConnection: { userId: thread.userId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, platform: true, externalAccountId: true, status: true },
  });
  const allowedAccountIds = new Set(accounts.map((account) => account.id));

  const history = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });

  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildUserScopedSystemPrompt(accounts) },
    ...mapHistoryToOpenAi(history.slice(-MAX_HISTORY_MESSAGES)),
  ];

  const toolMessages: Message[] = [];
  const ctx: ChatToolContext = { userId: thread.userId, threadId, allowedAccountIds };
  const turnAccountIds = new Set<string>();
  let finalText: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages: openaiMessages,
      tools: TOOL_DEFS_CHAT,
    });

    const message = completion.choices[0].message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      finalText = message.content ?? "";
      break;
    }

    openaiMessages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;

      const callAccountId = extractAccountIdFromArgs(toolCall.function.arguments);
      if (callAccountId) turnAccountIds.add(callAccountId);

      const result = await dispatchChatTool(toolCall.function.name, toolCall.function.arguments, ctx);
      const resultJson = JSON.parse(JSON.stringify(result));

      const toolMessage = await prisma.message.create({
        data: {
          threadId,
          credentialId: callAccountId,
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

  const assistantMessage = await prisma.message.create({
    data: {
      threadId,
      credentialId: turnAccountIds.size === 1 ? [...turnAccountIds][0] : null,
      role: "ASSISTANT",
      content: finalText,
    },
  });

  await prisma.conversationThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });

  return [userMessage, ...toolMessages, assistantMessage];
}

export interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  toolName: string | null;
  accountId: string | null;
  accountName: string | null;
  createdAt: string;
}

/** Denormaliza o nome da conta em cada mensagem (quando houver) pra UI mostrar de qual
 * conta de anuncio um turno tratava, sem precisar de mais uma chamada do client. */
export async function toChatMessageViews(messages: Message[]): Promise<ChatMessageView[]> {
  const accountIds = [...new Set(messages.map((m) => m.credentialId).filter((id): id is string => id !== null))];
  const accounts = accountIds.length
    ? await prisma.adCredential.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, label: true, externalAccountId: true },
      })
    : [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  return messages.map((message) => {
    const account = message.credentialId ? accountById.get(message.credentialId) : undefined;
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      toolName: message.toolName,
      accountId: message.credentialId,
      accountName: account ? (account.label ?? account.externalAccountId) : null,
      createdAt: message.createdAt.toISOString(),
    };
  });
}
