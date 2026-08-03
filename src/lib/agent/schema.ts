import { z } from "zod";

export const proposalTypeSchema = z.enum([
  "NEW_CAMPAIGN",
  "PAUSE_AD",
  "ACTIVATE_AD",
  "ADJUST_BUDGET",
  "CREATE_AD_VARIATION",
  "CREATE_AB_TEST",
  "OTHER",
]);

export const platformSchema = z.enum(["META", "GOOGLE"]);

/**
 * Plano estruturado de uma campanha nova (so usado quando type=NEW_CAMPAIGN) - criativo e
 * segmentacao 100% escritos pela JAMILE, nao clonados de um anuncio existente. Objetivo
 * fica implicito em trafego/cliques (sem Pixel/conversion tracking configurado em lugar
 * nenhum do sistema hoje, otimizar por conversao/lead nao teria como funcionar direito).
 * A imagem do anuncio NAO faz parte disto - e anexada por um humano depois, na revisao da
 * proposta (ver Proposal.creativeAssetData) - a JAMILE nunca gera/promete uma imagem.
 */
// Subconjunto dos tipos de call_to_action que a Graph API do Meta realmente aceita em
// object_story_spec.link_data.call_to_action.type (createMetaAdCreative) - texto livre
// e rejeitado pela API, tem que ser um destes valores exatos.
export const META_CTA_TYPES = [
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "SUBSCRIBE",
  "CONTACT_US",
  "DOWNLOAD",
  "GET_QUOTE",
  "BOOK_TRAVEL",
  "APPLY_NOW",
  "GET_OFFER",
] as const;

export const campaignPlanSchema = z
  .object({
    campaignName: z.string().min(3),
    dailyBudget: z.number().positive(),
    headline: z.string().min(3),
    primaryText: z.string().min(10),
    description: z.string().min(3),
    // So usado no Meta (object_story_spec.call_to_action.type) - o Google RSA nao tem
    // campo de call-to-action.
    callToAction: z.enum(META_CTA_TYPES),
    finalUrl: z.string().url(),
    // Meta: paises/idade/interesses em portugues simples - a resolucao pro ID real do
    // interesse (Graph API nao aceita palavra livre) acontece so na hora de executar.
    metaTargeting: z
      .object({
        countries: z.array(z.string()).min(1),
        ageMin: z.number().min(18).max(65),
        ageMax: z.number().min(18).max(65),
        interests: z.array(z.string()).min(1),
      })
      .optional(),
    // Google: so Search, keywords literais (sem resolucao de ID necessaria).
    googleKeywords: z
      .array(z.object({ text: z.string().min(1), matchType: z.enum(["BROAD", "PHRASE", "EXACT"]) }))
      .min(3)
      .optional(),
    // Google: um Responsive Search Ad exige varias variacoes de headline/description (a
    // API recusa com menos) - os campos unicos headline/primaryText/description acima
    // foram pensados pro Meta (um so anuncio de imagem) e nao servem pro RSA do Google.
    googleAd: z
      .object({
        headlines: z.array(z.string().min(1).max(30)).min(3).max(15),
        descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
      })
      .optional(),
  })
  .refine((plan) => plan.metaTargeting || plan.googleKeywords, {
    message: "campaignPlan precisa de metaTargeting (Meta) ou googleKeywords (Google)",
  })
  .refine((plan) => !plan.googleKeywords || plan.googleAd, {
    message: "campaignPlan pro Google precisa de googleAd (headlines/descriptions do Responsive Search Ad)",
    path: ["googleAd"],
  });

export type CampaignPlan = z.infer<typeof campaignPlanSchema>;

/** Forma base do payload (ZodObject puro, sem refine) - `proposalPayloadChatSchema` precisa
 * partir daqui com `.extend()` antes de aplicar o refine de NEW_CAMPAIGN (ZodEffects, o tipo
 * que sai de `.refine()`, nao tem `.extend()`). */
const proposalPayloadObjectSchema = z.object({
  type: proposalTypeSchema,
  title: z.string().min(3),
  reason: z.string().min(10),
  metricsJson: z.record(z.string(), z.union([z.number(), z.string()])),
  suggestedAction: z.string().min(3),
  risk: z.string().min(3),
  rollbackPlan: z.string().min(3),
  platform: platformSchema.nullable(),
  platformCampaignId: z.string().nullable(),
  platformAdId: z.string().nullable(),
  platformAdSetId: z.string().nullable(),
  campaignPlan: campaignPlanSchema.optional(),
});

const requireCampaignPlanForNewCampaign = (payload: { type: string; campaignPlan?: unknown }) =>
  payload.type !== "NEW_CAMPAIGN" || payload.campaignPlan !== undefined;

/** Payload estruturado que a tool `propose_action` recebe do modelo. */
export const proposalPayloadSchema = proposalPayloadObjectSchema.refine(requireCampaignPlanForNewCampaign, {
  message: "NEW_CAMPAIGN exige campaignPlan",
  path: ["campaignPlan"],
});

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

export const getMetricsArgsSchema = z.object({
  platform: platformSchema.optional(),
  // Pra "puxar" (drill down) de campanha/conjunto pra anuncio: filtra so os
  // anuncios daquela campanha/conjunto especifico, usando os ids ja devolvidos por
  // get_ad_sets/get_ranking - nunca filtrar por nome, so por id real.
  campaignId: z.string().optional(),
  adSetId: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type GetMetricsArgs = z.infer<typeof getMetricsArgsSchema>;

export const getAdSetsArgsSchema = z.object({
  platform: platformSchema.optional(),
});

export type GetAdSetsArgs = z.infer<typeof getAdSetsArgsSchema>;

export const getCampaignsArgsSchema = z.object({
  platform: platformSchema.optional(),
  /** Só campanhas veiculando agora - o padrão é trazer todas (ativas e pausadas). */
  onlyActive: z.boolean().optional(),
});

export type GetCampaignsArgs = z.infer<typeof getCampaignsArgsSchema>;

export const researchStubArgsSchema = z.object({
  query: z.string().min(1),
});

export type ResearchStubArgs = z.infer<typeof researchStubArgsSchema>;

export const getMetricsHistoryArgsSchema = z.object({
  platformAdId: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(10),
});

export type GetMetricsHistoryArgs = z.infer<typeof getMetricsHistoryArgsSchema>;

export const getAdBudgetArgsSchema = z.object({
  platform: platformSchema,
  platformAdSetId: z.string().nullable().optional(),
  platformCampaignId: z.string().nullable().optional(),
});

export type GetAdBudgetArgs = z.infer<typeof getAdBudgetArgsSchema>;

export const getAdLibraryArgsSchema = z.object({
  platform: platformSchema.optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type GetAdLibraryArgs = z.infer<typeof getAdLibraryArgsSchema>;

export const searchPublicAdLibraryArgsSchema = z.object({
  query: z.string().min(2),
  countries: z.array(z.string()).optional(),
});

export type SearchPublicAdLibraryArgs = z.infer<typeof searchPublicAdLibraryArgsSchema>;

export const listCustomAudiencesArgsSchema = z.object({});

export type ListCustomAudiencesArgs = z.infer<typeof listCustomAudiencesArgsSchema>;

/**
 * Variantes "Chat" dos schemas acima - usadas so pelo chat por usuario
 * (lib/agent/tools/index.ts, dispatchChatTool), onde o modelo escolhe a conta por
 * chamada em vez de uma conta fixa no contexto. Cada uma adiciona "accountId"
 * (obrigatorio) ao schema original; o resto dos campos e identico.
 */
export const getRankingChatArgsSchema = z.object({
  accountId: z.string(),
});

export type GetRankingChatArgs = z.infer<typeof getRankingChatArgsSchema>;

export const getMetricsChatArgsSchema = getMetricsArgsSchema.extend({
  accountId: z.string(),
});

export type GetMetricsChatArgs = z.infer<typeof getMetricsChatArgsSchema>;

export const getAdSetsChatArgsSchema = getAdSetsArgsSchema.extend({
  accountId: z.string(),
});

export type GetAdSetsChatArgs = z.infer<typeof getAdSetsChatArgsSchema>;

export const getCampaignsChatArgsSchema = getCampaignsArgsSchema.extend({
  accountId: z.string(),
});

export type GetCampaignsChatArgs = z.infer<typeof getCampaignsChatArgsSchema>;

export const getMetricsHistoryChatArgsSchema = getMetricsHistoryArgsSchema.extend({
  accountId: z.string(),
});

export type GetMetricsHistoryChatArgs = z.infer<typeof getMetricsHistoryChatArgsSchema>;

export const getAdBudgetChatArgsSchema = getAdBudgetArgsSchema.extend({
  accountId: z.string(),
});

export type GetAdBudgetChatArgs = z.infer<typeof getAdBudgetChatArgsSchema>;

export const getAdLibraryChatArgsSchema = getAdLibraryArgsSchema.extend({
  accountId: z.string(),
});

export type GetAdLibraryChatArgs = z.infer<typeof getAdLibraryChatArgsSchema>;

export const searchPublicAdLibraryChatArgsSchema = searchPublicAdLibraryArgsSchema.extend({
  accountId: z.string(),
});

export type SearchPublicAdLibraryChatArgs = z.infer<typeof searchPublicAdLibraryChatArgsSchema>;

export const listCustomAudiencesChatArgsSchema = z.object({
  accountId: z.string(),
});

export type ListCustomAudiencesChatArgs = z.infer<typeof listCustomAudiencesChatArgsSchema>;

export const proposalPayloadChatSchema = proposalPayloadObjectSchema
  .extend({ accountId: z.string() })
  .refine(requireCampaignPlanForNewCampaign, { message: "NEW_CAMPAIGN exige campaignPlan", path: ["campaignPlan"] });

export type ProposalPayloadChat = z.infer<typeof proposalPayloadChatSchema>;

/**
 * Tools de decisao/execucao - so existem no caminho de chat (TOOL_DEFS_CHAT), nunca no
 * TOOL_DEFS usado pelo scheduler autonomo, entao nao precisam de uma variante "base" sem
 * accountId como as tools de leitura acima - ja nascem com accountId obrigatorio.
 */
export const getProposalChatArgsSchema = z.object({
  accountId: z.string(),
  proposalId: z.string(),
});

export type GetProposalChatArgs = z.infer<typeof getProposalChatArgsSchema>;

export const decideProposalDecisionSchema = z.enum(["approve", "reject", "test"]);

const resolveProposalChatObjectSchema = z.object({
  accountId: z.string(),
  proposalId: z.string(),
  decision: decideProposalDecisionSchema,
  note: z.string().min(1).optional(),
});

/** "reject" exige nota (mesma regra ja aplicada hoje na rota REST /api/proposals/[id]/reject).
 * approve/test decidem E executam numa chamada so - substitui decide_proposal + execute_proposal
 * como 2 chamadas separadas (ver src/lib/proposals/chatActions.ts::resolveProposal). */
export const resolveProposalChatArgsSchema = resolveProposalChatObjectSchema.refine(
  (args) => args.decision !== "reject" || (args.note && args.note.trim().length > 0),
  { message: "decision=reject exige note", path: ["note"] }
);

export type ResolveProposalChatArgs = z.infer<typeof resolveProposalChatArgsSchema>;

export const adjustProposalChatArgsSchema = z.object({
  accountId: z.string(),
  proposalId: z.string(),
  title: z.string().min(3).optional(),
  suggestedAction: z.string().min(3).optional(),
  proposedBudget: z.number().positive().optional(),
  platformCampaignId: z.string().min(1).optional(),
  platformAdId: z.string().min(1).optional(),
  platformAdSetId: z.string().min(1).optional(),
  metricsJson: z.record(z.string(), z.number()).optional(),
  note: z.string().min(1),
});

export type AdjustProposalChatArgs = z.infer<typeof adjustProposalChatArgsSchema>;

/** Mesmo formato de payload de propose_action - cria a proposta E ja aprova+executa numa
 * chamada so, pra uma acao nova que o usuario acabou de confirmar (ver
 * src/lib/proposals/chatActions.ts::confirmAndExecuteAction). */
export const confirmAndExecuteActionChatArgsSchema = proposalPayloadChatSchema;

export type ConfirmAndExecuteActionChatArgs = z.infer<typeof confirmAndExecuteActionChatArgsSchema>;

export const deleteProposalChatArgsSchema = z.object({
  accountId: z.string(),
  proposalId: z.string(),
});

export type DeleteProposalChatArgs = z.infer<typeof deleteProposalChatArgsSchema>;
