import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, type PersonaAccountInput } from "@/lib/agent/persona";
import { TOOL_DEFS, dispatchTool } from "@/lib/agent/tools";
import type { RecommendedAction, Verdict } from "@/lib/ranking/verdict";
import { classifyFunnelStage, type FunnelStage } from "@/lib/ranking/funnel";

const MAX_ITERATIONS = 8;

/**
 * Nucleo comum das rodadas autonomas (mesmas tools do chat, sem persistir nada em
 * ConversationThread/Message - a rodada automatica do scheduler nao deve poluir o
 * historico de chat do usuario). So o resultado de "propose_action", se a JAMILE
 * chamar, vira uma Proposal de verdade - o resto do raciocinio e descartado.
 * Compartilhado por runAutonomousBudgetProposal e runAutonomousNewCampaignScan -
 * o loop de tool-calling e identico, so o prompt de tarefa muda.
 */
async function runAutonomousTurn(
  brand: PersonaAccountInput & { id: string },
  taskPrompt: string
): Promise<{ proposalCreated: boolean; proposalId: string | null }> {
  const ctx = { accountId: brand.id };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(brand) },
    { role: "user", content: taskPrompt },
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

/** Roda a JAMILE pra analisar UM candidato a escala especifico e decidir, com
 * julgamento, se e quanto ajustar a verba. */
export async function runAutonomousBudgetProposal(
  brand: PersonaAccountInput & { id: string },
  action: RecommendedAction
): Promise<{ proposalCreated: boolean; proposalId: string | null }> {
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

  return runAutonomousTurn(brand, prompt);
}

interface ExistingCampaignSummary {
  platform: string;
  campaignName: string;
  funnelStage: FunnelStage | null;
}

/** Uma linha por campanha com dado coletado (nao por anuncio) - pra JAMILE avaliar
 * cobertura de funil sem precisar contar/agrupar ela mesma. */
async function summarizeExistingCampaigns(accountId: string): Promise<ExistingCampaignSummary[]> {
  const snapshots = await prisma.adMetricSnapshot.findMany({
    where: { credentialId: accountId, collectionState: "OK" },
    orderBy: { collectedAt: "desc" },
    distinct: ["platform", "platformCampaignId"],
    select: { platform: true, campaignName: true },
  });

  const seen = new Set<string>();
  const summary: ExistingCampaignSummary[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.campaignName) continue;
    const key = `${snapshot.platform}:${snapshot.campaignName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summary.push({
      platform: snapshot.platform,
      campaignName: snapshot.campaignName,
      funnelStage: classifyFunnelStage(snapshot.campaignName),
    });
  }
  return summary;
}

/**
 * Roda a JAMILE pra avaliar, com julgamento real (nao uma regra fixa - "oportunidade
 * de campanha nova" nao e algo que da pra classificar por bucket determinístico como
 * pausar/escalar), se existe motivo concreto pra propor uma campanha nova pra esta
 * marca agora. Chamada 1x por marca por rodada do scheduler (nao por anuncio, e uma
 * decisao no nivel da marca) - pedido do Renan: "caso encontre oportunidade de
 * criacao de novas campanhas ela vai me sugerir no meu dashboard". "Nenhuma acao" e
 * o resultado esperado na maioria das rodadas - so propoe com motivo citavel.
 */
export async function runAutonomousNewCampaignScan(
  brand: PersonaAccountInput & { id: string },
  verdict: Verdict
): Promise<{ proposalCreated: boolean; proposalId: string | null }> {
  const campaigns = await summarizeExistingCampaigns(brand.id);
  const campaignLines =
    campaigns.length > 0
      ? campaigns
          .map((c) => `- ${c.platform} · "${c.campaignName}" · funil: ${c.funnelStage ?? "não identificado"}`)
          .join("\n")
      : "(nenhuma campanha com dado coletado ainda)";

  const prompt = `Analise se existe uma oportunidade REAL de criar uma campanha NOVA do zero pra esta marca agora - nao uma otimizacao de algo que ja existe.

Veredito geral mais recente da marca: ${verdict}.
Campanhas existentes com dado coletado, e o estagio de funil de cada uma (TOPO/MEIO/FUNDO):
${campaignLines}

Considere motivos concretos, por exemplo: falta cobertura de algum estagio de funil (ex: so tem campanha de topo, nenhuma de fundo/remarketing pra converter quem ja conhece a marca); ou a biblioteca publica de anuncios (search_public_ad_library) revela um angulo/tema forte no mercado sobre o assunto desta marca que ainda nao esta sendo explorado nas campanhas atuais.

So proponha (propose_action, type=NEW_CAMPAIGN) se achar um motivo concreto e citavel - "nenhuma acao" e uma resposta valida e esperada na maioria das rodadas, nao e obrigatorio sugerir toda vez so por sugerir. Se decidir propor, pesquise a biblioteca publica de anuncios do tema primeiro, monte um campaignPlan completo (Meta ou Google, dependendo de qual plataforma faz mais sentido pra essa oportunidade especifica) e explique em "reason" o motivo concreto encontrado, citando o dado ou a referencia de mercado que embasa a sugestao.`;

  return runAutonomousTurn(brand, prompt);
}
