import type { ChatCompletionFunctionTool, ChatCompletionTool } from "openai/resources/chat/completions";
import {
  proposalPayloadSchema,
  getMetricsArgsSchema,
  getMetricsHistoryArgsSchema,
  getAdSetsArgsSchema,
  getAdBudgetArgsSchema,
  getAdLibraryArgsSchema,
  searchPublicAdLibraryArgsSchema,
  researchStubArgsSchema,
  getRankingChatArgsSchema,
  getMetricsChatArgsSchema,
  getMetricsHistoryChatArgsSchema,
  getAdSetsChatArgsSchema,
  getAdBudgetChatArgsSchema,
  getAdLibraryChatArgsSchema,
  searchPublicAdLibraryChatArgsSchema,
  proposalPayloadChatSchema,
  getProposalChatArgsSchema,
  decideProposalChatArgsSchema,
  adjustProposalChatArgsSchema,
  executeProposalChatArgsSchema,
  deleteProposalChatArgsSchema,
} from "@/lib/agent/schema";
import { getRanking } from "./getRanking";
import { getMetrics } from "./getMetrics";
import { getMetricsHistory } from "./getMetricsHistory";
import { getAdSets } from "./getAdSets";
import { getAdBudget } from "./getAdBudget";
import { getAdLibrary } from "./getAdLibrary";
import { searchPublicAdLibrary } from "./searchPublicAdLibrary";
import { proposeAction } from "./proposeAction";
import { researchStub } from "./researchStub";
import { getProposal } from "./getProposal";
import { decideProposalAsUser, adjustProposalAsUser } from "@/lib/proposals/decide";
import { executeProposal } from "@/lib/execution/executor";
import { deleteProposalAsUser } from "@/lib/proposals/deleteProposal";

export interface ToolContext {
  brandId: string;
  /** Ausente quando a analise e autonoma (rodada do scheduler), sem chat associado. */
  threadId?: string;
}

/**
 * Definicao das tools expostas ao modelo pra rodada AUTONOMA do scheduler
 * (autonomous.ts) - "propose_action" e a unica acao possivel aqui, e continua sendo:
 * a rodada automatica nunca decide nem executa nada sozinha, so cria propostas
 * deterministicas/analisa orcamento, igual sempre foi. As tools de decisao/execucao
 * reais (decide_proposal/adjust_proposal/execute_proposal) so existem no caminho de
 * chat interativo abaixo (TOOL_DEFS_CHAT) - nunca aqui.
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
      description:
        "Le as metricas de anuncio (spend, CTR, CPC, CPL, CPA, conversoes) mais recentes coletadas para a marca, cada uma ja marcada com seu campaignId/campaignName e adSetId/adSetName. A lista devolvida pode vir truncada pelo limit (ver totalCount/returnedCount/truncated na resposta) - nunca conte ou some itens dessa lista pra responder 'quantos anuncios'/'quanto no total'; pra perguntas de contagem por conjunto de anuncios use get_ad_sets, que ja vem calculado. Pra ver so os anuncios de UM conjunto/campanha especifico (ex: depois de usar get_ad_sets pra achar o conjunto certo, ou antes de propor pausar/ativar/ajustar verba de um anuncio dentro dele), filtre por adSetId e/ou campaignId - sempre com o id real ja visto numa resposta anterior, nunca inventado.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["META", "GOOGLE"], description: "Filtra por plataforma. Omitir para ambas." },
          campaignId: { type: "string", description: "Filtra so os anuncios dessa campanha (id real, de get_ranking/get_ad_sets/get_metrics)." },
          adSetId: { type: "string", description: "Filtra so os anuncios desse conjunto de anuncios/AdSet/AdGroup (id real, de get_ad_sets/get_metrics)." },
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
      name: "get_ad_sets",
      description:
        "Agrupa os anuncios da marca por conjunto de anuncios (AdSet no Meta, Grupo de anuncios/AdGroup no Google) e ja devolve a contagem/soma pronta (quantos anuncios em cada, verba, conversoes) - CALCULADO NO SISTEMA, nao por voce. Use SEMPRE que o usuario perguntar 'quantos anuncios tem em cada conjunto/adset/grupo' ou pedir uma visao por conjunto de anuncios - nunca tente contar ou agrupar isso sozinho a partir da lista de get_metrics, que pode vir truncada e nao e pra ser somada manualmente. So devolve o RESUMO por conjunto (nao a lista de anuncios de dentro) - pra ver/agir em anuncios especificos de um conjunto (metricas, propor pausar/ativar/ajustar verba), pegue o adSetId daqui e chame get_metrics filtrando por adSetId.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["META", "GOOGLE"], description: "Filtra por plataforma. Omitir para ambas." },
        },
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
            description:
              "Obrigatorio para NEW_CAMPAIGN. Plano completo da campanha nova. Pro Meta, preencha metaTargeting (usa headline/primaryText/description/callToAction - um so anuncio de imagem, a imagem em si e anexada por um humano depois, voce nunca gera/promete imagem). Pro Google, preencha googleKeywords E googleAd (Responsive Search Ad - so texto, sem imagem) - headline/primaryText/description sozinhos NAO bastam pro Google, o RSA exige varias variacoes.",
            properties: {
              campaignName: { type: "string" },
              dailyBudget: { type: "number", exclusiveMinimum: 0 },
              headline: { type: "string" },
              primaryText: { type: "string" },
              description: { type: "string" },
              callToAction: {
                type: "string",
                description: "So usado no Meta - o Google RSA nao tem call-to-action.",
                enum: ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "CONTACT_US", "DOWNLOAD", "GET_QUOTE", "BOOK_TRAVEL", "APPLY_NOW", "GET_OFFER"],
              },
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
              googleAd: {
                type: "object",
                description: "Obrigatorio junto de googleKeywords. Variacoes de texto do Responsive Search Ad.",
                properties: {
                  headlines: { type: "array", items: { type: "string", maxLength: 30 }, minItems: 3, maxItems: 15 },
                  descriptions: { type: "array", items: { type: "string", maxLength: 90 }, minItems: 2, maxItems: 4 },
                },
                required: ["headlines", "descriptions"],
                additionalProperties: false,
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
      case "get_ad_sets":
        return await getAdSets(ctx.brandId, getAdSetsArgsSchema.parse(parsedJson));
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
  "get_ad_sets",
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

const BRAND_ID_PARAM = {
  type: "string",
  description: "Id exato da marca (da lista de marcas do usuario no prompt de sistema) a que essa chamada se refere.",
};

/**
 * Tools de decisao/execucao real - so existem aqui, nunca em TOOL_DEFS (rodada
 * autonoma do scheduler). Isso e o portao: a JAMILE so ganha poder de
 * aprovar/rejeitar/ajustar/executar dentro de uma conversa real com um usuario
 * autenticado, nunca no processo automatico em background.
 */
const DECISION_TOOL_DEFS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_proposal",
      description:
        "Le os detalhes completos de UMA proposta especifica pelo id (razao, risco, plano de rollback, metricas, plano de campanha se houver, e se ja tem imagem anexada). Use sempre que o usuario referenciar uma proposta especifica (ex: veio de uma notificacao) antes de explicar ou decidir sobre ela. Mensagens vindas de notificacao ja trazem o id exato entre parenteses (ex: 'id: abc123') - use esse id diretamente, nunca adivinhe um id a partir so do titulo.",
      parameters: {
        type: "object",
        properties: { brandId: BRAND_ID_PARAM, proposalId: { type: "string" } },
        required: ["brandId", "proposalId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decide_proposal",
      description:
        "Aprova, rejeita, ou marca como 'em teste' uma proposta PENDENTE. SEMPRE reformule a acao exata numa frase clara e peca confirmacao explicita do usuario antes de chamar isto - nao ha como desfazer uma aprovacao sozinho depois. decision=reject exige note explicando o motivo. Isto NUNCA executa nada na plataforma - so muda o status da proposta. Pra mudar algo da proposta (titulo/acao/orcamento) em vez de so aprovar/rejeitar como esta, use adjust_proposal.",
      parameters: {
        type: "object",
        properties: {
          brandId: BRAND_ID_PARAM,
          proposalId: { type: "string" },
          decision: { type: "string", enum: ["approve", "reject", "test"] },
          note: { type: "string", description: "Motivo/observacao - obrigatorio quando decision=reject." },
        },
        required: ["brandId", "proposalId", "decision"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_proposal",
      description:
        "Edita uma proposta PENDENTE (titulo/acao sugerida/orcamento) a pedido do usuario e a deixa pronta pra decisao de novo. SEMPRE reformule o valor novo exato e peca confirmacao antes de chamar isto.",
      parameters: {
        type: "object",
        properties: {
          brandId: BRAND_ID_PARAM,
          proposalId: { type: "string" },
          title: { type: "string" },
          suggestedAction: { type: "string" },
          proposedBudget: { type: "number", exclusiveMinimum: 0 },
          note: { type: "string", description: "O que mudou e por que." },
        },
        required: ["brandId", "proposalId", "note"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_proposal",
      description:
        "EXECUTA DE VERDADE na plataforma (Meta/Google Ads) uma proposta ja aprovada ou em teste - gasta dinheiro real / muda campanha real, imediatamente. SEMPRE reformule a acao exata que vai acontecer e peca confirmacao explicita do usuario antes de chamar isto - sem excecao. Se a proposta for NEW_CAMPAIGN, avise antes que a campanha nasce PAUSADA e precisa ser ativada manualmente na plataforma depois de conferida. So funciona se a proposta ja estiver aprovada ou em teste (chame decide_proposal antes, se ainda nao estiver).",
      parameters: {
        type: "object",
        properties: { brandId: BRAND_ID_PARAM, proposalId: { type: "string" } },
        required: ["brandId", "proposalId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_proposal",
      description:
        "Apaga uma proposta de VERDADE do banco (nao so esconde) - use quando o usuario pedir pra tirar/remover/apagar uma proposta da tela (ex: uma antiga presa em 'precisa de mais dados', ou uma duplicada). SEMPRE confirme com o usuario antes de chamar, igual as outras acoes. So falha se a proposta ja tiver sido executada (sucesso ou falha) - nesse caso e historico real, nao pode ser apagado; explique isso ao usuario em vez de insistir.",
      parameters: {
        type: "object",
        properties: { brandId: BRAND_ID_PARAM, proposalId: { type: "string" } },
        required: ["brandId", "proposalId"],
        additionalProperties: false,
      },
    },
  },
];

/** Mesmas tools de TOOL_DEFS, com "brandId" adicionado a cada uma que le/escreve dado
 * de uma marca especifica, mais as tools de decisao/execucao (so existem aqui) -
 * usadas pelo chat por usuario. */
/** Descricoes que fazem sentido pro scheduler (TOOL_DEFS) mas ficam erradas/enganosas
 * no chat, onde a JAMILE ganha ferramentas de decisao/execucao que nao existem la -
 * "propose_action" descrita como "a UNICA acao possivel" contradizia diretamente o
 * resto do prompt e contribuia pra ela parar de proposito depois de criar a proposta,
 * mesmo quando o usuario pediu a acao diretamente. So sobrescreve aqui, TOOL_DEFS
 * (scheduler) mantem a descricao original, que la continua certa. */
const CHAT_TOOL_DESCRIPTION_OVERRIDES: Record<string, string> = {
  propose_action:
    "Cria uma proposta de acao (mantem o registro/auditoria do sistema) - e o PRIMEIRO passo, nao o unico. Se o usuario pediu essa acao diretamente (nao foi so voce sugerindo por conta propria), depois de criar a proposta continue o ciclo: confirme a acao exata com o usuario, depois chame decide_proposal e execute_proposal na mesma proposta - nao pare so nesta chamada.",
};

export const TOOL_DEFS_CHAT: ChatCompletionTool[] = [
  ...(TOOL_DEFS as ChatCompletionFunctionTool[]).map((tool) => {
    const withBrand = BRAND_SCOPED_TOOL_NAMES.has(tool.function.name) ? withBrandIdParam(tool) : tool;
    const overrideDescription = CHAT_TOOL_DESCRIPTION_OVERRIDES[tool.function.name];
    if (!overrideDescription) return withBrand;
    const withBrandFn = withBrand as ChatCompletionFunctionTool;
    return { ...withBrandFn, function: { ...withBrandFn.function, description: overrideDescription } };
  }),
  ...DECISION_TOOL_DEFS,
];

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
      case "get_ad_sets": {
        const args = getAdSetsChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await getAdSets(args.brandId, args);
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
      case "get_proposal": {
        const args = getProposalChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        return await getProposal(args.brandId, args.proposalId);
      }
      case "decide_proposal": {
        const args = decideProposalChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        const targetStatus = { approve: "APPROVED", reject: "REJECTED", test: "TEST" }[args.decision] as
          | "APPROVED"
          | "REJECTED"
          | "TEST";
        const proposal = await decideProposalAsUser(ctx.userId, args.proposalId, targetStatus, args.note ?? null);
        return { proposalId: proposal.id, status: proposal.status };
      }
      case "adjust_proposal": {
        const args = adjustProposalChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        const proposal = await adjustProposalAsUser(
          ctx.userId,
          args.proposalId,
          { title: args.title, suggestedAction: args.suggestedAction, proposedBudget: args.proposedBudget },
          args.note
        );
        return { proposalId: proposal.id, status: proposal.status };
      }
      case "execute_proposal": {
        const args = executeProposalChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        const executionLog = await executeProposal(args.proposalId, ctx.userId);
        return { proposalId: args.proposalId, executionStatus: executionLog.status, errorMessage: executionLog.errorMessage };
      }
      case "delete_proposal": {
        const args = deleteProposalChatArgsSchema.parse(parsedJson);
        assertBrandAccess(ctx, args.brandId);
        await deleteProposalAsUser(ctx.userId, args.proposalId);
        return { proposalId: args.proposalId, deleted: true };
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
