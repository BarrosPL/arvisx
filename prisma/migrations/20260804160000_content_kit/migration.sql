-- Produto novo de geracao de conteudo social com IA (Brand Kit manual + Formatos/
-- Templates + Conteudo gerado) - primeira migration do modulo depois do F7 (Links)
-- ter sido revertido via `git revert`. O schema "content" fisico do F7 ainda existia
-- no banco (codigo sumiu, migration nao desfaz DDL sozinha) - drop+recria aqui,
-- idempotente pra rodar limpo tanto local quanto em producao (se aquele deploy do F7
-- chegou a rodar la).
DROP SCHEMA IF EXISTS "content" CASCADE;
CREATE SCHEMA "content";

CREATE TABLE "content"."Brand" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "palette" JSONB NOT NULL,
    "headingFontId" TEXT NOT NULL DEFAULT 'inter-bold',
    "bodyFontId" TEXT NOT NULL DEFAULT 'inter-regular',
    "voiceTone" TEXT,
    "voiceAttributes" TEXT[],
    "forbiddenTerms" TEXT[],
    "mandatoryTerms" JSONB,
    "industry" TEXT,
    "targetAudience" TEXT,
    "valueProposition" TEXT,
    "contentPillars" TEXT[],
    "legalDisclaimer" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Brand_slug_key" ON "content"."Brand" ("slug");
CREATE INDEX "Brand_ownerUserId_idx" ON "content"."Brand" ("ownerUserId");

-- Unica FK cross-schema deste modulo - integridade real com arvisx.User, SEM relation
-- Prisma (schema.prisma nao declara @relation aqui), mesmo desacoplamento do F7.
ALTER TABLE "content"."Brand"
  ADD CONSTRAINT "Brand_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "arvisx"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "content"."Format" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "safeArea" JSONB NOT NULL,

    CONSTRAINT "Format_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content"."Template" (
    "id" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "styleTags" TEXT[],
    "slots" JSONB NOT NULL,
    "sceneJson" JSONB NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Template_formatId_idx" ON "content"."Template" ("formatId");

ALTER TABLE "content"."Template"
  ADD CONSTRAINT "Template_formatId_fkey"
  FOREIGN KEY ("formatId") REFERENCES "content"."Format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "content"."Content" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "generation" JSONB NOT NULL,
    "scene" JSONB NOT NULL,
    "imageData" BYTEA NOT NULL,
    "imageMimeType" TEXT NOT NULL DEFAULT 'image/png',
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Content_brandId_createdAt_idx" ON "content"."Content" ("brandId", "createdAt");

ALTER TABLE "content"."Content"
  ADD CONSTRAINT "Content_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "content"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content"."Content"
  ADD CONSTRAINT "Content_formatId_fkey"
  FOREIGN KEY ("formatId") REFERENCES "content"."Format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content"."Content"
  ADD CONSTRAINT "Content_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "content"."Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grants pro papel restrito que a aplicacao usa em runtime (mesmo padrao de
-- 20260729185624_multi_schema_arvisx / 20260804120000_creative_library_asset). Sem
-- sequences aqui - todo id e cuid() gerado pela aplicacao, nao BIGSERIAL.
GRANT USAGE ON SCHEMA "content" TO arvisx_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "content" TO arvisx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "content" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arvisx_app;

-- Sem RLS - so "arvisx"."User" tem RLS hoje, tudo mais (incluindo "content".*) usa
-- checagem em codigo (ver lib/content/access.ts, a criar na fatia 3).
