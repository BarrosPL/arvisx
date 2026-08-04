import { z } from "zod";

/** Os 3 formatos seedados (Fatia 4) - lista fechada de propósito, o LLM só pode
 * escolher entre o que existe de verdade (nunca inventa um formatId). `brandId` é
 * obrigatório desde o multi-marca (Fatia B) - o LLM escolhe a partir do roster no
 * system prompt (persona.ts), validado contra o que o usuário realmente possui
 * (tools.ts) - mesmo padrão do "accountId" da JAMILE. */
export const generateContentArgsSchema = z.object({
  brandId: z.string().min(1),
  brief: z.string().trim().min(1).max(500),
  formatId: z.enum(["ig_feed_square", "ig_feed_portrait", "ig_story"]),
});

export type GenerateContentArgs = z.infer<typeof generateContentArgsSchema>;

/** Sem contentId de propósito - "qual peça revisar" é sempre a última gerada/revisada
 * NESTA thread (resolvida em tools.ts via ContentMessage.contentId), nunca um id cru
 * que o LLM teria que lembrar/inventar da conversa. */
export const reviseContentArgsSchema = z.object({
  instruction: z.string().trim().min(1).max(500),
});

export type ReviseContentArgs = z.infer<typeof reviseContentArgsSchema>;
