import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { buildSystemPrompt, type PersonaBrandInput } from "@/lib/agent/persona";
import { TOOL_DEFS, dispatchTool } from "@/lib/agent/tools";
import type { RecommendedAction } from "@/lib/ranking/verdict";

const MAX_ITERATIONS = 6;

/**
 * Roda a JAMILE (mesmas tools do chat) para analisar UM candidato a escala especifico
 * e decidir, com julgamento, se e quanto ajustar a verba - sem persistir nada em
 * ConversationThread/Message (a rodada automatica do scheduler nao deve poluir o
 * historico de chat do usuario). So o resultado de "propose_action", se ela chamar,
 * vira uma Proposal de verdade - o resto do raciocinio e descartado.
 */
export async function runAutonomousBudgetProposal(
  brand: PersonaBrandInput & { id: string },
  action: RecommendedAction
): Promise<{ proposalCreated: boolean; proposalId: string | null }> {
  const ctx = { brandId: brand.id };

  const prompt = `Analise este candidato a escala e decida se vale propor um ajuste de verba:
- Anuncio/campanha: ${action.row.adName ?? action.row.campaignName ?? "sem nome"}
- Plataforma: ${action.row.platform}
- platformCampaignId: ${action.row.platformCampaignId ?? "desconhecido"}
- platformAdId: ${action.row.platformAdId ?? "desconhecido"}
- platformAdSetId: ${action.row.platformAdSetId ?? "desconhecido"}
- Metricas dos ultimos 7 dias: spend=${action.row.spend}, ctr=${action.row.ctr}%, cpc=${action.row.cpc}, conversoes=${action.row.conversions}, cpl=${action.row.cpl ?? "n/d"}, cpa=${action.row.cpa ?? "n/d"}

Se fizer sentido propor um ajuste de verba, chame get_ad_budget primeiro para saber o
valor real atual, e depois propose_action com type=ADJUST_BUDGET. Se nao fizer sentido
agir agora, so explique brevemente e nao chame propose_action.`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(brand) },
    { role: "user", content: prompt },
  ];

  let proposalId: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages,
      tools: TOOL_DEFS,
    });
    const message = completion.choices[0].message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      break;
    }

    messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;
      const result = await dispatchTool(toolCall.function.name, toolCall.function.arguments, ctx);

      if (
        toolCall.function.name === "propose_action" &&
        result &&
        typeof result === "object" &&
        "proposalId" in result
      ) {
        const proposalResult = result as { proposalId: string | null };
        if (proposalResult.proposalId) proposalId = proposalResult.proposalId;
      }

      messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }

  return { proposalCreated: proposalId !== null, proposalId };
}
