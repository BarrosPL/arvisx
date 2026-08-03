import type { ChatCompletionFunctionTool, ChatCompletionTool } from "openai/resources/chat/completions";
import {
  proposalPayloadSchema,
  getMetricsArgsSchema,
  getMetricsHistoryArgsSchema,
  getAdSetsArgsSchema,
  getCampaignsArgsSchema,
  getAdBudgetArgsSchema,
  getAdLibraryArgsSchema,
  searchPublicAdLibraryArgsSchema,
  listCustomAudiencesArgsSchema,
  researchStubArgsSchema,
  getRankingChatArgsSchema,
  getMetricsChatArgsSchema,
  getMetricsHistoryChatArgsSchema,
  getAdSetsChatArgsSchema,
  getCampaignsChatArgsSchema,
  getAdBudgetChatArgsSchema,
  getAdLibraryChatArgsSchema,
  searchPublicAdLibraryChatArgsSchema,
  listCustomAudiencesChatArgsSchema,
  proposalPayloadChatSchema,
  getProposalChatArgsSchema,
  resolveProposalChatArgsSchema,
  adjustProposalChatArgsSchema,
  confirmAndExecuteActionChatArgsSchema,
  deleteProposalChatArgsSchema,
} from "@/lib/agent/schema";
import { getRanking } from "./getRanking";
import { getMetrics } from "./getMetrics";
import { getMetricsHistory } from "./getMetricsHistory";
import { getAdSets } from "./getAdSets";
import { getCampaigns } from "./getCampaigns";
import { getAdBudget } from "./getAdBudget";
import { getAdLibrary } from "./getAdLibrary";
import { searchPublicAdLibrary } from "./searchPublicAdLibrary";
import { listCustomAudiences } from "./listCustomAudiences";
import { proposeAction } from "./proposeAction";
import { researchStub } from "./researchStub";
import { getProposal } from "./getProposal";
import { adjustProposalAsUser } from "@/lib/proposals/decide";
import { confirmAndExecuteAction, resolveProposal } from "@/lib/proposals/chatActions";
import { deleteProposalAsUser } from "@/lib/proposals/deleteProposal";

export interface ToolContext {
  accountId: string;
  /** Ausente quando a analise e autonoma (rodada do scheduler), sem chat associado. */
  threadId?: string;
}

const ACCOUNT_ID_PARAM = {
  type: "string",
  description: "Id exato da conta de anuncio (da lista de contas do usuario no prompt de sistema) a que essa chamada se refere.",
};

/** Formato completo do payload de uma proposta - reaproveitado por propose_action
 * (TOOL_DEFS, sem accountId - vem do ToolContext) e confirm_and_execute_action
 * (DECISION_TOOL_DEFS, com accountId - o chat escolhe a conta por chamada). */
const PROPOSAL_PAYLOAD_PROPERTIES = {
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
  platformCampaignId: {
    type: ["string", "null"],
    description:
      "ID real da campanha na plataforma, se a acao for sobre algo existente. Pra PAUSE_AD/ACTIVATE_AD quando o usuario pede pra pausar/ativar A CAMPANHA INTEIRA (nem um anuncio nem um conjunto especifico dela): preencha SO este campo, deixe platformAdId e platformAdSetId de fora.",
  },
  platformAdId: {
    type: ["string", "null"],
    description:
      "ID real do anuncio na plataforma, se a acao for sobre algo existente. Pra PAUSE_AD/ACTIVATE_AD quando o usuario pede pra pausar/ativar um ANUNCIO ESPECIFICO: preencha este campo com o id real desse anuncio - nunca escolha/invente um anuncio qualquer de dentro de uma campanha/conjunto so pra preencher isto quando o pedido era sobre um nivel mais amplo (campanha ou conjunto inteiro).",
  },
  platformAdSetId: {
    type: ["string", "null"],
    description:
      "ID real do conjunto de anuncios/AdSet (Meta) ou grupo de anuncios/AdGroup (Google). Obrigatorio quando type=ADJUST_BUDGET no Meta (e onde a verba mora). Pra PAUSE_AD/ACTIVATE_AD quando o usuario pede pra pausar/ativar O CONJUNTO/GRUPO INTEIRO (nao um anuncio especifico dentro dele, nem a campanha toda): preencha este campo (mais platformCampaignId, se souber) e deixe platformAdId de fora.",
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
    required: ["campaignName", "dailyBudget", "headline", "primaryText", "description", "callToAction", "finalUrl"],
    additionalProperties: false,
  },
} as const;

const PROPOSAL_PAYLOAD_REQUIRED = [
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
];

/**
 * Definicao das tools expostas ao modelo pra rodada AUTONOMA do scheduler
 * (autonomous.ts) - "propose_action" e a unica acao possivel aqui, e continua sendo:
 * a rodada automatica nunca decide nem executa nada sozinha, so cria propostas
 * deterministicas/analisa orcamento, igual sempre foi. As tools de decisao/execucao
 * reais (confirm_and_execute_action/resolve_proposal/adjust_proposal) so existem no
 * caminho de chat interativo abaixo (TOOL_DEFS_CHAT) - nunca aqui.
 */
export const TOOL_DEFS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_ranking",
      description:
        "Le o ultimo veredito de ranking (BOM/MEDIO/RUIM) e as ate 3 acoes recomendadas para a conta, recalculando se o snapshot estiver desatualizado.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_metrics",
      description:
        "Le as metricas de anuncio (spend, CTR, CPC, CPL, CPA, conversoes) mais recentes coletadas para a conta, cada uma ja marcada com seu campaignId/campaignName e adSetId/adSetName. A lista devolvida pode vir truncada pelo limit (ver totalCount/returnedCount/truncated na resposta) - nunca conte ou some itens dessa lista pra responder 'quantos anuncios'/'quanto no total'; pra perguntas de contagem por conjunto de anuncios use get_ad_sets, que ja vem calculado. Pra ver so os anuncios de UM conjunto/campanha especifico (ex: depois de usar get_ad_sets pra achar o conjunto certo, ou antes de propor pausar/ativar/ajustar verba de um anuncio dentro dele), filtre por adSetId e/ou campaignId - sempre com o id real ja visto numa resposta anterior, nunca inventado.",
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
        "Agrupa os anuncios da conta por conjunto de anuncios (AdSet no Meta, Grupo de anuncios/AdGroup no Google) e ja devolve a contagem/soma pronta (quantos anuncios em cada, verba, conversoes) - CALCULADO NO SISTEMA, nao por voce. Use SEMPRE que o usuario perguntar 'quantos anuncios tem em cada conjunto/adset/grupo' ou pedir uma visao por conjunto de anuncios - nunca tente contar ou agrupar isso sozinho a partir da lista de get_metrics, que pode vir truncada e nao e pra ser somada manualmente. So devolve o RESUMO por conjunto (nao a lista de anuncios de dentro) - pra ver/agir em anuncios especificos de um conjunto (metricas, propor pausar/ativar/ajustar verba), pegue o adSetId daqui e chame get_metrics filtrando por adSetId.",
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
      name: "get_campaigns",
      description:
        "Le as metricas no nivel de CAMPANHA (ultimos 7 dias): resultado, custo por resultado (CPR), gasto, impressoes, alcance, CPM e status real de cada campanha. Use SEMPRE que a pergunta for sobre campanha ('como estao minhas campanhas', 'quais campanhas estao ativas', 'qual campanha gasta mais', 'qual o alcance da campanha X') - NUNCA some as linhas de get_metrics pra montar numero de campanha. Dois numeros so estao corretos aqui e nao podem ser calculados a partir de anuncio: (1) alcance, que e gente unica e vem deduplicado pela plataforma - somar o alcance dos anuncios contaria a mesma pessoa varias vezes; (2) resultado/CPR, que aqui ja respeita o OBJETIVO de cada campanha, igual a coluna 'Resultados' do Gerenciador de Anuncios (o campo resultType diz qual acao foi contada). Pra descer pro nivel de conjunto ou anuncio depois, use get_ad_sets/get_metrics.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["META", "GOOGLE"], description: "Filtra por plataforma. Omitir para ambas." },
          onlyActive: { type: "boolean", description: "So campanhas veiculando agora. Omitir traz ativas e pausadas." },
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
      name: "list_custom_audiences",
      description:
        "Lista os publicos personalizados (Custom Audiences) ja criados na conta Meta, com tamanho aproximado e status de entrega. So existe para Meta. Use antes de propor um publico novo (lookalike, exclusao por camada de funil) pra nao recriar um que ja existe.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
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
        properties: PROPOSAL_PAYLOAD_PROPERTIES,
        required: PROPOSAL_PAYLOAD_REQUIRED,
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
        return await getRanking(ctx.accountId);
      case "get_metrics":
        return await getMetrics(ctx.accountId, getMetricsArgsSchema.parse(parsedJson));
      case "get_metrics_history":
        return await getMetricsHistory(ctx.accountId, getMetricsHistoryArgsSchema.parse(parsedJson));
      case "get_ad_sets":
        return await getAdSets(ctx.accountId, getAdSetsArgsSchema.parse(parsedJson));
      case "get_campaigns":
        return await getCampaigns(ctx.accountId, getCampaignsArgsSchema.parse(parsedJson));
      case "get_ad_budget":
        return await getAdBudget(ctx.accountId, getAdBudgetArgsSchema.parse(parsedJson));
      case "get_ad_library":
        return await getAdLibrary(ctx.accountId, getAdLibraryArgsSchema.parse(parsedJson));
      case "search_public_ad_library":
        return await searchPublicAdLibrary(ctx.accountId, searchPublicAdLibraryArgsSchema.parse(parsedJson));
      case "list_custom_audiences":
        listCustomAudiencesArgsSchema.parse(parsedJson);
        return await listCustomAudiences(ctx.accountId);
      case "propose_action":
        return await proposeAction({ credentialId: ctx.accountId, threadId: ctx.threadId }, proposalPayloadSchema.parse(parsedJson));
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
// Chat por usuario (multi-conta): o modelo escolhe a conta por chamada em vez de
// uma conta fixa no contexto (usado so pelo chat, nao pela rodada autonoma do
// scheduler - autonomous.ts continua usando TOOL_DEFS/ToolContext/dispatchTool
// acima, sem nenhuma mudanca).
// ---------------------------------------------------------------------------

const ACCOUNT_SCOPED_TOOL_NAMES = new Set([
  "get_ranking",
  "get_metrics",
  "get_metrics_history",
  "get_ad_sets",
  "get_campaigns",
  "get_ad_budget",
  "get_ad_library",
  "search_public_ad_library",
  "list_custom_audiences",
  "propose_action",
]);

interface JsonSchemaObject {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Clona uma tool def e injeta "accountId" (obrigatorio) nos parametros - o modelo tem
 * que informar de qual conta do usuario e essa chamada especifica. Todas as entradas
 * de TOOL_DEFS sao function tools (nunca custom tools), daqui o cast direto. */
function withAccountIdParam(tool: ChatCompletionFunctionTool): ChatCompletionFunctionTool {
  const params = tool.function.parameters as unknown as JsonSchemaObject;
  return {
    ...tool,
    function: {
      ...tool.function,
      parameters: {
        ...params,
        properties: {
          accountId: {
            type: "string",
            description: "Id exato da conta de anuncio (da lista de contas do usuario no prompt de sistema) a que essa chamada se refere.",
          },
          ...params.properties,
        },
        required: ["accountId", ...(params.required ?? [])],
      },
    },
  };
}

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
        properties: { accountId: ACCOUNT_ID_PARAM, proposalId: { type: "string" } },
        required: ["accountId", "proposalId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_and_execute_action",
      description:
        "Pra uma acao NOVA (ainda sem proposta criada) que o usuario ACABOU de confirmar (pedida por ele diretamente, ou sugerida por voce e confirmada agora): cria o registro da proposta E JA APROVA E EXECUTA de verdade na plataforma (Meta/Google Ads), tudo numa chamada so - gasta dinheiro real / muda campanha real, imediatamente. SEMPRE reformule a acao exata e peca confirmacao explicita do usuario ANTES de chamar isto - sem excecao. Mesmo formato de payload de propose_action. Se faltar dado real ou (NEW_CAMPAIGN/Meta) a imagem do anuncio, isto NAO executa - devolve o motivo pra voce resolver (buscar mais dado, ou pedir a imagem) e depois chamar resolve_proposal na mesma proposta pra terminar. Se a proposta for NEW_CAMPAIGN, avise que ela nasce PAUSADA e precisa ser ativada manualmente na plataforma depois de conferida.",
      parameters: {
        type: "object",
        properties: { accountId: ACCOUNT_ID_PARAM, ...PROPOSAL_PAYLOAD_PROPERTIES },
        required: ["accountId", ...PROPOSAL_PAYLOAD_REQUIRED],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_proposal",
      description:
        "Decide sobre uma proposta que JA EXISTE (veio de get_proposal, de uma notificacao, ou de um confirm_and_execute_action anterior que ficou faltando dado/imagem e agora esta pronto) - E JA EXECUTA de verdade na plataforma quando aprovada, tudo numa chamada so. decision=approve ou test: aprova e executa imediatamente (gasta dinheiro real / muda campanha real). decision=reject: so rejeita, nao executa nada (exige note com o motivo). SEMPRE reformule a acao exata e peca confirmacao explicita do usuario ANTES de chamar isto com approve/test - sem excecao. Se for NEW_CAMPAIGN, avise que ela nasce PAUSADA.",
      parameters: {
        type: "object",
        properties: {
          accountId: ACCOUNT_ID_PARAM,
          proposalId: { type: "string" },
          decision: { type: "string", enum: ["approve", "reject", "test"] },
          note: { type: "string", description: "Motivo/observacao - obrigatorio quando decision=reject." },
        },
        required: ["accountId", "proposalId", "decision"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_proposal",
      description:
        "Edita uma proposta (titulo/acao sugerida/orcamento/ids reais/metricas) e a deixa pronta (PENDING) pra decisao de novo. Funciona tanto numa proposta PENDENTE quanto numa presa em NEEDS_MORE_DATA - nesse segundo caso E A UNICA FERRAMENTA que consegue tirar a proposta desse estado: preencha platformCampaignId/platformAdId/platformAdSetId e/ou metricsJson com o dado real que faltava (busque com get_metrics/get_ad_sets antes) - se ainda faltar algo depois disso, a chamada falha explicando exatamente o que falta ainda. Depois que isto funcionar, chame resolve_proposal (decision=approve) pra aprovar e executar. SEMPRE reformule o valor novo exato e peca confirmacao antes de chamar isto.",
      parameters: {
        type: "object",
        properties: {
          accountId: ACCOUNT_ID_PARAM,
          proposalId: { type: "string" },
          title: { type: "string" },
          suggestedAction: { type: "string" },
          proposedBudget: { type: "number", exclusiveMinimum: 0 },
          platformCampaignId: { type: "string", description: "Preenche/corrige o id real da campanha - use pra completar uma proposta presa em NEEDS_MORE_DATA por falta de id." },
          platformAdId: { type: "string", description: "Preenche/corrige o id real do anuncio - use pra completar uma proposta presa em NEEDS_MORE_DATA por falta de id." },
          platformAdSetId: { type: "string", description: "Preenche/corrige o id real do conjunto de anuncios/AdSet ou grupo/AdGroup." },
          metricsJson: { type: "object", description: "Metricas reais adicionais (spend/ctr/cpc/cpl/cpa/conversions) - use pra completar uma proposta presa em NEEDS_MORE_DATA por falta de metrica financeira." },
          note: { type: "string", description: "O que mudou e por que." },
        },
        required: ["accountId", "proposalId", "note"],
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
        properties: { accountId: ACCOUNT_ID_PARAM, proposalId: { type: "string" } },
        required: ["accountId", "proposalId"],
        additionalProperties: false,
      },
    },
  },
];

/** Mesmas tools de TOOL_DEFS, com "accountId" adicionado a cada uma que le/escreve dado
 * de uma conta especifica, mais as tools de decisao/execucao (so existem aqui) -
 * usadas pelo chat por usuario. */
/** Descricoes que fazem sentido pro scheduler (TOOL_DEFS) mas ficam erradas/enganosas
 * no chat, onde a JAMILE ganha ferramentas de decisao/execucao que nao existem la.
 * "propose_action" no scheduler e "a UNICA acao possivel" (verdade la); no chat isso
 * e falso - existe confirm_and_execute_action pra quando o pedido ja foi confirmado.
 * So sobrescreve aqui, TOOL_DEFS (scheduler) mantem a descricao original, que la
 * continua certa. */
const CHAT_TOOL_DESCRIPTION_OVERRIDES: Record<string, string> = {
  propose_action:
    "Registra uma sugestao de acao SUA, por iniciativa propria, ainda SEM confirmacao do usuario - use so quando voce mesma notou uma oportunidade e quer perguntar antes de agir. Se o usuario ja pediu a acao diretamente, ou ja confirmou uma sugestao sua nesta mesma troca de mensagens, NAO use isto - use confirm_and_execute_action, que cria e ja executa numa chamada so, sem deixar proposta solta.",
};

export const TOOL_DEFS_CHAT: ChatCompletionTool[] = [
  ...(TOOL_DEFS as ChatCompletionFunctionTool[]).map((tool) => {
    const withAccount = ACCOUNT_SCOPED_TOOL_NAMES.has(tool.function.name) ? withAccountIdParam(tool) : tool;
    const overrideDescription = CHAT_TOOL_DESCRIPTION_OVERRIDES[tool.function.name];
    if (!overrideDescription) return withAccount;
    const withAccountFn = withAccount as ChatCompletionFunctionTool;
    return { ...withAccountFn, function: { ...withAccountFn.function, description: overrideDescription } };
  }),
  ...DECISION_TOOL_DEFS,
];

export interface ChatToolContext {
  userId: string;
  threadId: string;
  /** Contas de anuncio que o usuario da thread realmente possui (via ProviderConnection)
   * - o portao duro de seguranca: nenhuma tool roda pra uma conta fora desse conjunto,
   * nao importa o que o modelo tenha "decidido". */
  allowedAccountIds: Set<string>;
}

function assertAccountAccess(ctx: ChatToolContext, accountId: string): void {
  if (!ctx.allowedAccountIds.has(accountId)) {
    throw new Error("Você não tem acesso a essa conta de anúncio.");
  }
}

/** Despacha uma tool call do chat por usuario - equivalente a dispatchTool, mas a
 * conta vem do argumento (escolhido pelo modelo) e e validada contra allowedAccountIds
 * antes de qualquer leitura/escrita. Erros (incluindo falha de acesso) viram {error},
 * nunca derrubam o loop do orchestrator. */
export async function dispatchChatTool(name: string, rawArgs: string, ctx: ChatToolContext): Promise<unknown> {
  try {
    const parsedJson = rawArgs.trim().length > 0 ? JSON.parse(rawArgs) : {};

    switch (name) {
      case "get_ranking": {
        const args = getRankingChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getRanking(args.accountId);
      }
      case "get_metrics": {
        const args = getMetricsChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getMetrics(args.accountId, args);
      }
      case "get_metrics_history": {
        const args = getMetricsHistoryChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getMetricsHistory(args.accountId, args);
      }
      case "get_ad_sets": {
        const args = getAdSetsChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getAdSets(args.accountId, args);
      }
      case "get_campaigns": {
        const args = getCampaignsChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getCampaigns(args.accountId, args);
      }
      case "get_ad_budget": {
        const args = getAdBudgetChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getAdBudget(args.accountId, args);
      }
      case "get_ad_library": {
        const args = getAdLibraryChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getAdLibrary(args.accountId, args);
      }
      case "search_public_ad_library": {
        const args = searchPublicAdLibraryChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await searchPublicAdLibrary(args.accountId, args);
      }
      case "list_custom_audiences": {
        const args = listCustomAudiencesChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await listCustomAudiences(args.accountId);
      }
      case "propose_action": {
        const args = proposalPayloadChatSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await proposeAction({ credentialId: args.accountId, threadId: ctx.threadId, userId: ctx.userId }, args);
      }
      case "confirm_and_execute_action": {
        const args = confirmAndExecuteActionChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await confirmAndExecuteAction(ctx.userId, { accountId: args.accountId, threadId: ctx.threadId }, args);
      }
      case "get_proposal": {
        const args = getProposalChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await getProposal(args.accountId, args.proposalId);
      }
      case "resolve_proposal": {
        const args = resolveProposalChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        return await resolveProposal(ctx.userId, args.proposalId, args.decision, args.note ?? null);
      }
      case "adjust_proposal": {
        const args = adjustProposalChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
        const proposal = await adjustProposalAsUser(
          ctx.userId,
          args.proposalId,
          {
            title: args.title,
            suggestedAction: args.suggestedAction,
            proposedBudget: args.proposedBudget,
            platformCampaignId: args.platformCampaignId,
            platformAdId: args.platformAdId,
            platformAdSetId: args.platformAdSetId,
            metricsJson: args.metricsJson,
          },
          args.note
        );
        return { proposalId: proposal.id, status: proposal.status };
      }
      case "delete_proposal": {
        const args = deleteProposalChatArgsSchema.parse(parsedJson);
        assertAccountAccess(ctx, args.accountId);
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

/** Extrai o accountId (se houver) dos argumentos crus de uma tool call do chat -
 * usado pelo orchestrator so pra rotular qual conta cada Message/tool call tratava
 * na UI, depois que dispatchChatTool ja validou o acesso de verdade. */
export function extractAccountIdFromArgs(rawArgs: string): string | null {
  try {
    const parsed = JSON.parse(rawArgs);
    return typeof parsed?.accountId === "string" ? parsed.accountId : null;
  } catch {
    return null;
  }
}
