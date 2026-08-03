import { describe, expect, it } from "vitest";
import { planSummarization, KEEP_VERBATIM_MESSAGES, SUMMARIZE_TRIGGER_MESSAGES } from "./summarizationPlan";
import type { Message } from "@/generated/prisma/client";

/** Mensagem fake minima - planSummarization so olha o array em si (comprimento/ordem),
 * nunca o conteudo dos campos, entao o resto pode ficar generico. */
function fakeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    threadId: "thread-1",
    credentialId: null,
    role: i % 2 === 0 ? "USER" : "ASSISTANT",
    content: `mensagem ${i}`,
    toolName: null,
    toolCallId: null,
    toolArgsJson: null,
    toolResultJson: null,
    tokensInput: null,
    tokensOutput: null,
    createdAt: new Date(2026, 0, 1, 0, i),
  })) as unknown as Message[];
}

describe("planSummarization", () => {
  it("nao resume enquanto o trecho nao-resumido nao passa do gatilho", () => {
    const messages = fakeMessages(SUMMARIZE_TRIGGER_MESSAGES);
    const plan = planSummarization(messages);
    expect(plan.shouldSummarize).toBe(false);
    expect(plan.toFold).toHaveLength(0);
    expect(plan.verbatimTail).toEqual(messages);
  });

  it("dispara ao passar do gatilho, mantendo so a cauda recente verbatim", () => {
    const messages = fakeMessages(SUMMARIZE_TRIGGER_MESSAGES + 1);
    const plan = planSummarization(messages);
    expect(plan.shouldSummarize).toBe(true);
    expect(plan.verbatimTail).toHaveLength(KEEP_VERBATIM_MESSAGES);
    expect(plan.toFold).toHaveLength(messages.length - KEEP_VERBATIM_MESSAGES);
  });

  it("toFold + verbatimTail cobrem TODAS as mensagens, sem sobra e sem duplicar", () => {
    const messages = fakeMessages(SUMMARIZE_TRIGGER_MESSAGES + 15);
    const plan = planSummarization(messages);
    expect([...plan.toFold, ...plan.verbatimTail]).toEqual(messages);
  });

  it("mantem a ordem cronologica - toFold e sempre o trecho mais antigo", () => {
    const messages = fakeMessages(SUMMARIZE_TRIGGER_MESSAGES + 5);
    const plan = planSummarization(messages);
    expect(plan.toFold[0].id).toBe("msg-0");
    expect(plan.toFold[plan.toFold.length - 1].id).toBe(
      messages[messages.length - KEEP_VERBATIM_MESSAGES - 1].id
    );
    expect(plan.verbatimTail[0].id).toBe(messages[messages.length - KEEP_VERBATIM_MESSAGES].id);
  });

  it("historico vazio (thread nova) nao tenta resumir", () => {
    const plan = planSummarization([]);
    expect(plan.shouldSummarize).toBe(false);
    expect(plan.verbatimTail).toHaveLength(0);
  });
});
