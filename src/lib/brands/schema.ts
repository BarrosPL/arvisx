import { z } from "zod";

const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const createBrandSchema = z.object({
  slug: z.string().min(2).max(40).regex(slugPattern, "use letras minusculas, numeros e hifen"),
  name: z.string().min(2).max(120),
  topicKeywords: z.array(z.string().min(1)).default([]),
  excludedKeywords: z.array(z.string().min(1)).default([]),
  priorityOrder: z.number().int().min(0).default(0),
});

export const updateBrandSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.enum(["ONBOARDING", "ACTIVE", "PAUSED"]).optional(),
  topicKeywords: z.array(z.string().min(1)).optional(),
  excludedKeywords: z.array(z.string().min(1)).optional(),
  priorityOrder: z.number().int().min(0).optional(),
  colorHex: z.string().max(20).nullable().optional(),
});
