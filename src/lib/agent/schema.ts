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

/** Payload estruturado que a tool `propose_action` recebe do modelo. */
export const proposalPayloadSchema = z.object({
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
});

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

export const getMetricsArgsSchema = z.object({
  platform: platformSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type GetMetricsArgs = z.infer<typeof getMetricsArgsSchema>;

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
