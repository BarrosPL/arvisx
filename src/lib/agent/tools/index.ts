import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
  proposalPayloadSchema,
  getMetricsArgsSchema,
  getMetricsHistoryArgsSchema,
  getAdBudgetArgsSchema,
  getAdLibraryArgsSchema,
  searchPublicAdLibraryArgsSchema,
  researchStubArgsSchema,
} from "@/lib/agent/schema";
import { getRanking } from "./getRanking";
import { getMetrics } from "./getMetrics";
import { getMetricsHistory } from "./getMetricsHistory";
import { getAdBudget } from "./getAdBudget";
import { getAdLibrary } from "./getAdLibrary";
import { searchPublicAdLibrary } from "./searchPublicAdLibrary";
import { proposeAction } from "./proposeAction";
import { researchStub } from "./researchStub";

export interface ToolContext {
  brandId: string;
  /** Ausente quando a analise e autonoma (rodada do scheduler), sem chat associado. */
  threadId?: string;
}

/**
 * Definicao das tools expostas ao modelo. Deliberadamente NAO existe nenhuma tool de
 * escrita em Meta/Google Ads nesta fase - "propose_action" e a unica acao possivel, e
 * o gate de execucao real so entra na Fase 4 depois de aprovacao humana.
 */
export const TOOL_DEFS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_ranking",
      description:
        "Le o ultimo veredito de ranking (BOM/MEDIO/RUIM) e as ate 3 acoes recomendadas para a marca, recalculando se o snapshot estiver desatualizado.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_metrics",
      description: "Le as metricas de anuncio (spend, CTR, CPC, CPL, CPA, conversoes) mais recentes coletadas para a marca.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["META", "GOOGLE"], description: "Filtra por plataforma. Omitir para ambas." },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_metrics_history",
      description:
        "Le o historico real de coletas de UM anuncio especifico, em ordem cronologica, para comparar performance ao longo do tempo (ex: CPL subiu ou caiu nas ultimas coletas).",
      parameters: {
        type: "object",
        properties: {
          platformAdId: { type: "string", description: "ID real do anuncio (retornado por get_metrics/get_ranking)." },
          limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
        },
        required: ["platformAdId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ad_budget",
      description:
        "Le a verba diaria REAL de uma campanha/anuncio direto no Meta ou Google Ads (nunca escreve nada). Use antes de propor ADJUST_BUDGET - voce precisa do valor atual pra sugerir um valor novo concreto.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["META", "GOOGLE"] },
          platformAdSetId: { type: ["string", "null"], description: "Obrigatorio para Meta - id do AdSet, onde a verba mora." },
          platformCampaignId: { type: ["string", "null"], description: "Obrigatorio para Google - id da campanha, onde a verba mora." },
        },
        required: ["platform"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ad_library",
      description:
        "Le a biblioteca de criativos ja publicados (conteudo do anuncio: nome, headline, texto) - inclui anuncio pausado ou sem gasto recente, diferente de get_metrics. Use pra reconhecer padroes do que ja funcionou antes de sugerir algo novo.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["META", "GOOGLE"], description: "Filtra por plataforma. Omitir para ambas." },
          search: { type: "string", description: "Busca por texto no nome/headline/copy/campanha (ex: 'cidadania italiana')." },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_public_ad_library",
      description:
        "Pesquisa a biblioteca PUBLICA de anuncios da Meta (qualquer anunciante, nao so a propria conta) por palavra-chave - use pra ver o que o mercado/concorrencia esta anunciando de verdade sobre um tema, como referencia de criativo/mensagem. So existe pra Meta (Google Ads Transparency Center nao tem API publica), mas serve de inspiracao pra recomendacao em qualquer plataforma, incluindo Google Ads - deixe isso explicito quando usar pra embasar uma sugestao de campanha Google. Nao ha numero de investimento/alcance (so existe pra anuncio politico).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Palavra-chave ou tema (ex: 'cidadania italiana', 'visto de trabalho')." },
          countries: {
            type: "array",
            items: { type: "string" },
            description: "Codigos de pais (ex: ['BR']). Omitir usa Brasil por padrao.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_action",
      description:
        "Cria uma proposta de acao pendente de aprovacao humana. Esta e a UNICA acao que voce pode tomar - nunca executa nada de fato.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["NEW_CAMPAIGN", "PAUSE_AD", "ACTIVATE_AD", "ADJUST_BUDGET", "CREATE_AD_VARIATION", "CREATE_AB_TEST", "OTHER"],
          },
          title: { type: "string" },
          reason: { type: "string", description: "Justificativa citando dado real ou HIPOTESE explicita." },
          metricsJson: { type: "object", description: "Metricas reais que embasam a proposta (spend, ctr, cpc, cpl, cpa, conversions etc)." },
          suggestedAction: { type: "string" },
          risk: { type: "string" },
          rollbackPlan: { type: "string" },
          platform: { type: ["string", "null"], enum: ["META", "GOOGLE", null] },
          platformCampaignId: { type: ["string", "null"], description: "ID real da campanha na plataforma, se a acao for sobre algo existente." },
          platformAdId: { type: ["string", "null"], description: "ID real do anuncio na plataforma, se a acao for sobre algo existente." },
          platformAdSetId: {
            type: ["string", "null"],
            description: "Obrigatorio quando type=ADJUST_BUDGET no Meta (id do AdSet) - e onde a execucao real vai mudar a verba.",
          },
        },
        required: [
          "type",
          "title",
          "reason",
          "metricsJson",
          "suggestedAction",
          "risk",
          "rollbackPlan",
          "platform",
          "platformCampaignId",
          "platformAdId",
          "platformAdSetId",
        ],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "research_market",
      description: "Pesquisa de mercado. Nesta versao nao ha fonte de dado ao vivo configurada - retorna isso explicitamente.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_competitors",
      description: "Pesquisa de concorrencia. Nesta versao nao ha fonte de dado ao vivo configurada - retorna isso explicitamente.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

/** Despacha uma tool call por nome. Erros sao capturados e devolvidos como {error} - nunca derrubam o loop do orchestrator. */
export async function dispatchTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  try {
    const parsedJson = rawArgs.trim().length > 0 ? JSON.parse(rawArgs) : {};

    switch (name) {
      case "get_ranking":
        return await getRanking(ctx.brandId);
      case "get_metrics":
        return await getMetrics(ctx.brandId, getMetricsArgsSchema.parse(parsedJson));
      case "get_metrics_history":
        return await getMetricsHistory(ctx.brandId, getMetricsHistoryArgsSchema.parse(parsedJson));
      case "get_ad_budget":
        return await getAdBudget(ctx.brandId, getAdBudgetArgsSchema.parse(parsedJson));
      case "get_ad_library":
        return await getAdLibrary(ctx.brandId, getAdLibraryArgsSchema.parse(parsedJson));
      case "search_public_ad_library":
        return await searchPublicAdLibrary(ctx.brandId, searchPublicAdLibraryArgsSchema.parse(parsedJson));
      case "propose_action":
        return await proposeAction(ctx, proposalPayloadSchema.parse(parsedJson));
      case "research_market":
      case "scan_competitors":
        return await researchStub(researchStubArgsSchema.parse(parsedJson));
      default:
        return { error: `Tool desconhecida: ${name}` };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro desconhecido ao executar tool" };
  }
}
