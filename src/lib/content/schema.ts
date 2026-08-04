import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen");

export const createBioPageSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(120),
});

export const updateBioPageSchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  headline: z.string().trim().max(160).optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  theme: z.record(z.string(), z.unknown()).optional().nullable(),
  seo: z.record(z.string(), z.unknown()).optional().nullable(),
  pixels: z.record(z.string(), z.unknown()).optional().nullable(),
  isPublished: z.boolean().optional(),
});

export type CreateBioPageInput = z.infer<typeof createBioPageSchema>;
export type UpdateBioPageInput = z.infer<typeof updateBioPageSchema>;

/**
 * Um schema por BioBlockType, mesmo que o editor/renderer só implemente um subconjunto
 * nesta fatia (link/whatsapp/text/image/social_icons/divider - ver plano, fatia 9 faz o
 * resto). Validar TODOS os tipos desde já é barato e evita retrabalho de schema depois.
 */
export const blockContentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("LINK"),
    config: z.object({
      label: z.string().trim().min(1).max(80),
      url: z.string().url(),
      icon: z.string().optional(),
      style: z.enum(["default", "outline", "filled"]).optional(),
      highlight: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("WHATSAPP"),
    config: z.object({
      phone: z.string().trim().min(8).max(20),
      prefilledMessage: z.string().trim().max(500).optional(),
      utmSource: z.string().trim().max(60).optional(),
    }),
  }),
  z.object({
    type: z.literal("LEAD_FORM"),
    config: z.object({
      leadFormId: z.string().min(1),
      mode: z.enum(["inline", "modal"]).default("inline"),
      buttonLabel: z.string().trim().min(1).max(60),
    }),
  }),
  z.object({
    type: z.literal("VIDEO"),
    config: z.object({
      provider: z.enum(["youtube", "vimeo", "direct"]),
      url: z.string().url(),
      autoplay: z.boolean().default(false),
    }),
  }),
  z.object({
    type: z.literal("TEXT"),
    config: z.object({ markdown: z.string().trim().min(1).max(4000) }),
  }),
  z.object({
    type: z.literal("IMAGE"),
    config: z.object({
      assetId: z.string().min(1),
      linkUrl: z.string().url().optional(),
      alt: z.string().trim().min(1).max(200),
    }),
  }),
  z.object({
    type: z.literal("SOCIAL_ICONS"),
    config: z.object({
      networks: z.array(z.object({ network: z.string().min(1), url: z.string().url() })).min(1).max(10),
    }),
  }),
  z.object({
    type: z.literal("FAQ"),
    config: z.object({
      items: z.array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(1000) })).min(1).max(20),
    }),
  }),
  z.object({
    type: z.literal("COUNTDOWN"),
    config: z.object({
      targetAt: z.string().datetime(),
      label: z.string().trim().min(1).max(80),
      onExpire: z.enum(["hide", "keep", "message"]).default("keep"),
    }),
  }),
  z.object({
    type: z.literal("PRODUCT_CARD"),
    config: z.object({
      title: z.string().trim().min(1).max(120),
      price: z.string().trim().min(1).max(40),
      image: z.string().url(),
      ctaUrl: z.string().url(),
    }),
  }),
  z.object({
    type: z.literal("CALENDAR_EMBED"),
    config: z.object({
      provider: z.enum(["calendly", "cal.com"]),
      url: z.string().url(),
    }),
  }),
  z.object({
    type: z.literal("DIVIDER"),
    config: z.object({ style: z.enum(["line", "space"]).default("line") }),
  }),
]);

export type BlockContentInput = z.infer<typeof blockContentSchema>;

export const createBioBlockSchema = blockContentSchema.and(
  z.object({
    scheduleFrom: z.string().datetime().optional().nullable(),
    scheduleTo: z.string().datetime().optional().nullable(),
  })
);

export const updateBioBlockSchema = z.object({
  content: blockContentSchema.optional(),
  isActive: z.boolean().optional(),
  scheduleFrom: z.string().datetime().optional().nullable(),
  scheduleTo: z.string().datetime().optional().nullable(),
});

export const reorderBlocksSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

export const leadFormFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case (ex: nome, email, telefone)"),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "email", "phone", "textarea"]),
  required: z.boolean(),
  purpose: z.enum(["contact", "marketing"]),
});

export const createLeadFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  fields: z.array(leadFormFieldSchema).min(1).max(20),
  consentText: z.string().trim().min(1).max(2000),
  consentRequired: z.boolean().default(true),
  privacyPolicyUrl: z.string().url(),
  successAction: z.object({
    type: z.enum(["message", "redirect"]),
    message: z.string().trim().max(300).optional(),
    redirectUrl: z.string().url().optional(),
  }),
  // Presente => gera um segredo novo (revelado em texto puro so nesta resposta, nunca
  // mais depois - ver rota). Omitido => sem webhook.
  webhookUrl: z.string().url().optional(),
});

export const updateLeadFormSchema = createLeadFormSchema.partial().extend({
  isActive: z.boolean().optional(),
  // null explicito remove o webhook (URL+segredo); string nova regenera o segredo;
  // omitido mantem o que ja tem (ver rota - so mexe no segredo se o valor mudar).
  webhookUrl: z.string().url().optional().nullable(),
});

export type LeadFormField = z.infer<typeof leadFormFieldSchema>;
export type CreateLeadFormInput = z.infer<typeof createLeadFormSchema>;

/**
 * Submissao publica - "consent" e por FINALIDADE (purpose), nao um booleano unico: um
 * form com fields so de purpose "contact" tem uma finalidade so (um checkbox na
 * pratica), mas a estrutura ja suporta duas finalidades (contact+marketing, dois
 * checkboxes) sem precisar de mudanca de schema depois - so a UI que ainda nao constroi
 * o segundo checkbox (nenhum field "marketing" existe no formulario padrao do v1).
 */
export const submitLeadSchema = z.object({
  fields: z.record(z.string(), z.string()),
  consent: z.record(z.string(), z.boolean()),
  utm: z.record(z.string(), z.string()).optional(),
  referrer: z.string().optional(),
  honeypot: z.string().optional(),
  turnstileToken: z.string().optional(),
});

export type SubmitLeadInput = z.infer<typeof submitLeadSchema>;
