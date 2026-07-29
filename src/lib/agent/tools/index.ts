import type { ChatCompletionFunctionTool, ChatCompletionTool } from "openai/resources/chat/completions";
import {
  proposalPayloadSchema,
  getMetricsArgsSchema,
  getMetricsHistoryArgsSchema,
  getAdBudgetArgsSchema,
  getAdLibraryArgsSchema,
  searchPublicAdLibraryArgsSchema,
  researchStubArgsSchema,
  getRankingChatArgsSchema,
  getMetricsChatArgsSchema,
  getMetricsHistoryChatArgsSchema,
  getAdBudgetChatArgsSchema,
  getAdLibraryChatArgsSchema,
  searchPublicAdLibraryChatArgsSchema,
  proposalPayloadChatSchema,
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
          campaignPlan: {
            type: "object",
            description: "Obrigatorio para NEW_CAMPAIGN. Plano completo da campanha nova.",
            properties: {
              campaignName: { type: "string" },
              dailyBudget: { type: "number", exclusiveMinimum: 0 },
              headline: { type: "string" },
              primaryText: { type: "string" },
              description: { type: "string" },
              callToAction: { type: "string" },
              finalUrl: { type: "string", format: "uri" },
              metaTargeting: {
                type: "object",
                properties: {
                  countries: { type: "array", items: { type: "string" }, minItems: 1 },
                  ageMin: { type: "integer", minimum: 18, maximum: 65 },
                  ageMax: { type: "integer", minimum: 18, maximum: 65 },
                  interests: { type: "array", items: { type: "string" }, minItems: 1 },
                },
                required: ["countries", "ageMin", "ageMax", "interests"],
                additionalProperties: false,
              },
              googleKeywords: {
                type: "array",
                minItems: 3,
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    matchType: { type: "string", enum: ["BROAD", "PHRASE", "EXACT"] },
                  },
                  required: ["text", "matchType"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "campaignName",
              "dailyBudget",
              "headline",
              "primaryText",
              "description",
              "callToAction",
              "finalUrl",
            ],
            additionalProperties: false,
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

// ---------------------------------------------------------------------------
// Chat por usuario (multi-marca): o modelo escolhe a marca por chamada em vez de
// uma marca fixa no contexto (usado so pelo chat, nao pela rodada autonoma do
// scheduler - autonomous.ts continua usando TOOL_DEFS/ToolContext/dispatchTool
// acima, sem nenhuma mudanca).
// ---------------------------------------------------------------------------

const BRAND_SCOPED_TOOL_NAMES = new Set([
  "get_ranking",
  "get_metrics",
  "get_metrics_history",
  "get_ad_budget",
  "get_ad_library",
  "search_public_ad_library",
  "propose_action",
]);

interface JsonSchemaObject {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Clona uma tool def e injeta "brandId" (obrigatorio) nos parametros - o modelo tem
 * que informar de qual marca do usuario e essa chamada especifica. Todas as entradas
 * de TOOL_DEFS sao function tools (nunca custom tools), daqui o cast direto. */
function withBrandIdParam(tool: ChatCompletionFunctionTool): ChatCompletionFunctionTool {
  const params = tool.function.parameters as unknown as JsonSchemaObject;
  return {
    ...tool,
    function: {
      ...tool.function,
      parameters: {
        ...params,
        properties: {
          brandId: {
            type: "string",
            description: "Id exato da marca (da lista de marcas do usuario no prompt de sistema) a que essa chamada se refere.",
          },
          ...params.properties,
        },
        required: ["brandId", ...(params.required ?? [])],
      },
    },
  };
}

/** Mesmas tools de TOOL_DEFS, mas com "brandId" adicionado a cada uma que le/escreve
 * dado de uma marca especifica - usadas pelo chat por usuario. */
export const TOOL_DEFS_CHAT: ChatCompletionTool[] = (TOOL_DEFS as ChatCompletionFunctionTool[]).map((tool) =>
  BRAND_SCOPED_TOOL_NAMES.has(tool.function.name) ? withBrandIdParam(tool) : tool
);

export interface ChatToolContext {
  userId: string;
  threadId: string;
  /** Marcas que o usuario da thread realmente tem BrandAccess - o portao duro de
   * seguranca: nenhuma tool roda pra uma marca fora desse conjunto, nao importa o
   * que o modelo tenha "decidido". */
  allowedBrandIds: Set<string>;
}

function assertBrandAccess(ctx: ChatToolContext, brandId: string): void {
  if (!ctx.allowedBrandIds.has(brandId)) {
    throw new Error("Você não tem acesso a essa marca.");
  }
}

/** Despacha uma tool call do chat por usuario - equivalente a dispatchTool, mas a
 * marca vem do argumento (escolhido pelo modelo) e e validada contra allowedBrandIds
 * antes de qualquer leitura/escrita. Erros (incluindo falha de acesso) viram {error},
 * nunca derrubam o loop do orchestrator. */
export async function dispatchChatTool(name: string, rawArgs: string, ctx: ChatToolContext): Promise<unknown> {
  try {
    const parsedJson = rawArgs.trim().length > 0 ? JSON.parse(rawArgs) : {};

    switch (name) {
      case "get_ranking": {
        const args = getRankingChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await getRanking(args.brandId);
      }
      case "get_metrics": {
        const args = getMetricsChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await getMetrics(args.brandId, args);
      }
      case "get_metrics_history": {
        const args = getMetricsHistoryChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await getMetricsHistory(args.brandId, args);
      }
      case "get_ad_budget": {
        const args = getAdBudgetChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await getAdBudget(args.brandId, args);
      }
      case "get_ad_library": {
        const args = getAdLibraryChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await getAdLibrary(args.brandId, args);
      }
      case "search_public_ad_library": {
        const args = searchPublicAdLibraryChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await searchPublicAdLibrary(args.brandId, args);
      }
      case "propose_action": {
        const args = proposalPayloadChatSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await proposeAction({ brandId: args.brandId, threadId: ctx.threadId }, args);
      }
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

/** Extrai o brandId (se houver) dos argumentos crus de uma tool call do chat -
 * usado pelo orchestrator so pra rotular qual marca cada Message/tool call tratava
 * na UI, depois que dispatchChatTool ja validou o acesso de verdade. */
export function extractBrandIdFromArgs(rawArgs: string): string | null {
  try {
    const parsed = JSON.parse(rawArgs);
    return typeof parsed?.brandId === "string" ? parsed.brandId : null;
  } catch {
    return null;
  }
}
