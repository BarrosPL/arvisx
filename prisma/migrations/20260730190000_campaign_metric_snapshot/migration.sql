-- CampaignMetricSnapshot: metrica no nivel de CAMPANHA, tabela separada de
-- AdMetricSnapshot de proposito (ver comentario no schema.prisma). Duas coisas so
-- existem aqui: alcance CORRETO (a Meta deduplica no servidor quando a consulta e
-- level=campaign; somar o alcance dos anuncios contaria a mesma pessoa varias vezes)
-- e o status da propria campanha (antes o sistema so conhecia status de anuncio).
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29
-- (objetos ja existentes em producao por caminho fora do historico de migrations
-- quebraram um deploy anterior).
CREATE TABLE IF NOT EXISTS "arvisx"."CampaignMetricSnapshot" (
  "id"                 TEXT NOT NULL,
  "brandId"            TEXT NOT NULL,
  "credentialId"       TEXT NOT NULL,
  "platform"           "arvisx"."Platform" NOT NULL,
  "platformCampaignId" TEXT,
  "campaignName"       TEXT,
  "campaignStatus"     TEXT,
  "objective"          TEXT,
  "collectionState"    "arvisx"."CollectionState" NOT NULL,
  "dateRangeStart"     TIMESTAMP(3) NOT NULL,
  "dateRangeEnd"       TIMESTAMP(3) NOT NULL,
  "spend"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "impressions"        INTEGER NOT NULL DEFAULT 0,
  "clicks"             INTEGER NOT NULL DEFAULT 0,
  "ctr"                DECIMAL(7,4) NOT NULL DEFAULT 0,
  "cpc"                DECIMAL(10,2) NOT NULL DEFAULT 0,
  "results"            INTEGER NOT NULL DEFAULT 0,
  "resultType"         TEXT,
  "cpr"                DECIMAL(10,2),
  "reach"              INTEGER,
  "frequency"          DECIMAL(6,2),
  "cpm"                DECIMAL(10,2),
  "raw"                JSONB,
  "errorMessage"       TEXT,
  "collectedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CampaignMetricSnapshot_brandId_platform_collectedAt_idx"
  ON "arvisx"."CampaignMetricSnapshot" ("brandId", "platform", "collectedAt");

CREATE INDEX IF NOT EXISTS "CampaignMetricSnapshot_brandId_platformCampaignId_idx"
  ON "arvisx"."CampaignMetricSnapshot" ("brandId", "platformCampaignId");

-- ADD CONSTRAINT nao aceita IF NOT EXISTS - checa no catalogo antes, mesmo efeito.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CampaignMetricSnapshot_brandId_fkey'
  ) THEN
    ALTER TABLE "arvisx"."CampaignMetricSnapshot"
      ADD CONSTRAINT "CampaignMetricSnapshot_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "arvisx"."Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CampaignMetricSnapshot_credentialId_fkey'
  ) THEN
    ALTER TABLE "arvisx"."CampaignMetricSnapshot"
      ADD CONSTRAINT "CampaignMetricSnapshot_credentialId_fkey"
      FOREIGN KEY ("credentialId") REFERENCES "arvisx"."AdCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- A migration add_restricted_app_role ja deixou ALTER DEFAULT PRIVILEGES pro papel de
-- migrations, mas isso so vale se a tabela for criada pelo MESMO papel que rodou
-- aquela migration - o grant explicito aqui garante o acesso independente disso (a
-- aplicacao roda como arvisx_app, sem BYPASSRLS).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'arvisx_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "arvisx"."CampaignMetricSnapshot" TO arvisx_app;
  END IF;
END
$$;
