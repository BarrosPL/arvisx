import type { Message } from "@/generated/prisma/client";
import { openai, AGENT_MODEL } from "@/lib/openai";

function roleLabel(message: Message): string {
  return message.role === "USER" ? "Usuário" : "JAMILE";
}

/**
 * Dobra `messages` no resumo existente, devolvendo o resumo ATUALIZADO (nunca só a
 * diferença) - cada chamada recebe o resultado da anterior, entao o resumo e sempre
 * cumulativo desde o inicio real da conversa, mesmo que a thread tenha passado por
 * varias rodadas de resumo ao longo do tempo.
 *
 * A instrucao de preservar proposta/preferencia/decisao e o que faz isto ser memoria
 * de verdade, nao um "TL;DR" generico - sem isso o resumo perderia exatamente o tipo
 * de coisa cuja falta o Renan reportou (contexto de proposta, decisao tomada).
 *
 * "O que resumir e quando" (planSummarization) fica em summarizationPlan.ts, separado
 * de proposito - la e logica pura testavel sem OpenAI, aqui e a chamada de verdade.
 */
export async function foldMessagesIntoSummary(
  previousSummary: string | null,
  messages: Message[]
): Promise<string> {
  const transcript = messages.map((message) => `${roleLabel(message)}: ${message.content}`).join("\n");

  const prompt = `Você mantém um resumo contínuo de uma conversa entre um usuário e a JAMILE, agente de gestão de tráfego pago (Meta/Google Ads).

Resumo atual (pode estar vazio, se for a primeira vez):
${previousSummary?.trim() || "(nenhum ainda)"}

Novas mensagens a incorporar, em ordem:
${transcript}

Devolva o resumo ATUALIZADO (o texto completo, não só o que mudou), em português, sempre preservando especificamente:
- Qualquer proposta mencionada: id, título, do que se trata, e o status se for conhecido.
- Preferências ou instruções permanentes que o usuário deu (ex: "sempre me avise antes de X", "prefiro ajustes de Y%").
- Decisões tomadas e o motivo por trás delas.
- Fatos concretos sobre contas/campanhas discutidos (nomes, números citados, problemas identificados).

Seja conciso no resto - o objetivo é não perder o que importa pra continuar a conversa depois, não reproduzir tudo que foi dito.`;

  const completion = await openai.chat.completions.create({
    model: AGENT_MODEL,
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0]?.message.content?.trim() || previousSummary || "";
}
