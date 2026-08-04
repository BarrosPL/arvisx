-- SPEC_Funcionalidades.md, modulo F7 (Links/bio page) - primeiro modulo do produto de
-- conteudo social com IA, completamente separado do gestor de trafego (schema "arvisx").
-- Ver plano em C:\Users\lcsin\.claude\plans\hidden-zooming-cat.md.
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.
-- CREATE TYPE checa por (typname, namespace) explicitamente - com duas schemas agora
-- ("arvisx" e "content"), checar so por typname seria impreciso.
CREATE SCHEMA IF NOT EXISTS "content";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'BioBlockType' AND n.nspname = 'content'
  ) THEN
    CREATE TYPE "content"."BioBlockType" AS ENUM (
      'LINK', 'WHATSAPP', 'LEAD_FORM', 'VIDEO', 'TEXT', 'IMAGE', 'SOCIAL_ICONS',
      'FAQ', 'COUNTDOWN', 'PRODUCT_CARD', 'CALENDAR_EMBED', 'DIVIDER'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'BioEventType' AND n.nspname = 'content'
  ) THEN
    CREATE TYPE "content"."BioEventType" AS ENUM ('PAGE_VIEW', 'BLOCK_CLICK', 'FORM_SUBMIT');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'LeadStatus' AND n.nspname = 'content'
  ) THEN
    CREATE TYPE "content"."LeadStatus" AS ENUM ('NEW', 'SPAM', 'ARCHIVED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'WebhookDeliveryStatus' AND n.nspname = 'content'
  ) THEN
    CREATE TYPE "content"."WebhookDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DISABLED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "content"."Brand" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "theme" JSONB,
    "leadRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Brand_slug_key" ON "content"."Brand" ("slug");
CREATE INDEX IF NOT EXISTS "Brand_ownerUserId_idx" ON "content"."Brand" ("ownerUserId");

-- Unica FK cross-schema deste modulo: integridade real com arvisx.User, mas SEM relation
-- Prisma (schema.prisma nao declara @relation aqui) - mantem o modulo desacoplado do
-- gestor de trafego no nivel de codigo, so o banco garante a referencia.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Brand_ownerUserId_fkey') THEN
    ALTER TABLE "content"."Brand"
      ADD CONSTRAINT "Brand_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "arvisx"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "content"."BioPage" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "title" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "theme" JSONB,
    "seo" JSONB,
    "pixels" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BioPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BioPage_slug_key" ON "content"."BioPage" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "BioPage_customDomain_key" ON "content"."BioPage" ("customDomain");
CREATE INDEX IF NOT EXISTS "BioPage_brandId_idx" ON "content"."BioPage" ("brandId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BioPage_brandId_fkey') THEN
    ALTER TABLE "content"."BioPage"
      ADD CONSTRAINT "BioPage_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "content"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "content"."BioBlock" (
    "id" TEXT NOT NULL,
    "bioPageId" TEXT NOT NULL,
    "type" "content"."BioBlockType" NOT NULL,
    "position" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scheduleFrom" TIMESTAMP(3),
    "scheduleTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BioBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BioBlock_bioPageId_idx" ON "content"."BioBlock" ("bioPageId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BioBlock_bioPageId_fkey') THEN
    ALTER TABLE "content"."BioBlock"
      ADD CONSTRAINT "BioBlock_bioPageId_fkey"
      FOREIGN KEY ("bioPageId") REFERENCES "content"."BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- DEFERRABLE: a rota de reorder reescreve TODAS as posicoes de uma pagina numa unica
-- transacao - sem isso, a troca intermediaria de duas posicoes violaria a unicidade no
-- meio do caminho (ela so e reavaliada no COMMIT, nao a cada UPDATE).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BioBlock_bioPageId_position_key') THEN
    ALTER TABLE "content"."BioBlock"
      ADD CONSTRAINT "BioBlock_bioPageId_position_key"
      UNIQUE ("bioPageId", "position") DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "content"."LeadForm" (
    "id" TEXT NOT NULL,
    "bioPageId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "consentText" TEXT NOT NULL,
    "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "privacyPolicyUrl" TEXT NOT NULL,
    "successAction" JSONB NOT NULL,
    "webhookUrl" TEXT,
    "webhookSecretEnc" TEXT,
    "doubleOptin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadForm_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadForm_bioPageId_idx" ON "content"."LeadForm" ("bioPageId");
CREATE INDEX IF NOT EXISTS "LeadForm_brandId_idx" ON "content"."LeadForm" ("brandId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadForm_bioPageId_fkey') THEN
    ALTER TABLE "content"."LeadForm"
      ADD CONSTRAINT "LeadForm_bioPageId_fkey"
      FOREIGN KEY ("bioPageId") REFERENCES "content"."BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadForm_brandId_fkey') THEN
    ALTER TABLE "content"."LeadForm"
      ADD CONSTRAINT "LeadForm_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "content"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "content"."Lead" (
    "id" TEXT NOT NULL,
    "leadFormId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "consent" JSONB NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "utm" JSONB,
    "referrer" TEXT,
    "status" "content"."LeadStatus" NOT NULL DEFAULT 'NEW',
    "webhookStatus" "content"."WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
    "webhookNextAttemptAt" TIMESTAMP(3),
    "webhookLastError" TEXT,
    "syncedTo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Lead_leadFormId_createdAt_idx" ON "content"."Lead" ("leadFormId", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_brandId_createdAt_idx" ON "content"."Lead" ("brandId", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_webhookStatus_webhookNextAttemptAt_idx" ON "content"."Lead" ("webhookStatus", "webhookNextAttemptAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_leadFormId_fkey') THEN
    ALTER TABLE "content"."Lead"
      ADD CONSTRAINT "Lead_leadFormId_fkey"
      FOREIGN KEY ("leadFormId") REFERENCES "content"."LeadForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_brandId_fkey') THEN
    ALTER TABLE "content"."Lead"
      ADD CONSTRAINT "Lead_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "content"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "content"."BioEvent" (
    "id" BIGSERIAL NOT NULL,
    "bioPageId" TEXT NOT NULL,
    "blockId" TEXT,
    "event" "content"."BioEventType" NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "utm" JSONB,
    "country" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BioEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BioEvent_bioPageId_createdAt_idx" ON "content"."BioEvent" ("bioPageId", "createdAt");
CREATE INDEX IF NOT EXISTS "BioEvent_bioPageId_event_createdAt_idx" ON "content"."BioEvent" ("bioPageId", "event", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BioEvent_bioPageId_fkey') THEN
    ALTER TABLE "content"."BioEvent"
      ADD CONSTRAINT "BioEvent_bioPageId_fkey"
      FOREIGN KEY ("bioPageId") REFERENCES "content"."BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BioEvent_blockId_fkey') THEN
    ALTER TABLE "content"."BioEvent"
      ADD CONSTRAINT "BioEvent_blockId_fkey"
      FOREIGN KEY ("blockId") REFERENCES "content"."BioBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Grants explicitos (mesmo padrao de 20260729185624_multi_schema_arvisx) - nao confia
-- que o ALTER DEFAULT PRIVILEGES global de 20260729172458_add_restricted_app_role (sem
-- IN SCHEMA, mas por ROLE de quem roda a migration) cobre implicitamente um schema que
-- nao existia quando aquela migration rodou.
GRANT USAGE ON SCHEMA "content" TO arvisx_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "content" TO arvisx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "content" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arvisx_app;

-- Sem RLS em nenhuma tabela deste schema - so "arvisx"."User" tem RLS hoje, tudo mais
-- (incluindo agora "content".*) usa checagem em codigo (ver lib/content/access.ts).
