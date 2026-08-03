-- Esteira completa da spec-gestor-trafego-ia.md: NEW_FUNNEL cria as 5 camadas
-- (Frio/Morno/Quente/Remarketing/1%) juntas, cada uma com o proprio criativo.
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.
-- ALTER TYPE ... ADD VALUE nao aceita IF NOT EXISTS junto com outras alteracoes no
-- Postgres antigo, mas aceita sozinho desde o PG12 - envolvido num bloco DO por
-- seguranca, caso a migration seja reaplicada por engano.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ProposalType' AND n.nspname = 'arvisx' AND e.enumlabel = 'NEW_FUNNEL'
  ) THEN
    ALTER TYPE "arvisx"."ProposalType" ADD VALUE 'NEW_FUNNEL';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FunnelLayerKey') THEN
    CREATE TYPE "arvisx"."FunnelLayerKey" AS ENUM ('FRIO', 'MORNO', 'QUENTE', 'REMARKETING', 'LOOKALIKE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "arvisx"."ProposalFunnelLayer" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "layerKey" "arvisx"."FunnelLayerKey" NOT NULL,
    "campaignName" TEXT NOT NULL,
    "dailyBudgetMinorUnits" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "primaryText" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "callToAction" TEXT NOT NULL,
    "creativeAssetData" BYTEA,
    "creativeAssetMimeType" TEXT,
    "creativeVideoData" BYTEA,
    "creativeVideoMimeType" TEXT,
    "creativeCoverImageData" BYTEA,
    "creativeCoverImageMimeType" TEXT,
    "platformCampaignId" TEXT,
    "platformAdSetId" TEXT,
    "platformAdId" TEXT,
    "customAudienceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalFunnelLayer_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProposalFunnelLayer_proposalId_fkey'
  ) THEN
    ALTER TABLE "arvisx"."ProposalFunnelLayer"
      ADD CONSTRAINT "ProposalFunnelLayer_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "arvisx"."Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProposalFunnelLayer_proposalId_layerKey_key"
  ON "arvisx"."ProposalFunnelLayer" ("proposalId", "layerKey");
