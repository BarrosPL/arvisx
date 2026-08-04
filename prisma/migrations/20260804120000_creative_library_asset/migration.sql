-- Banco de criativos por produto/gancho (spec-gestor-trafego-ia.md secao 3) - catalogo
-- so por enquanto, sem integracao com o upload de NEW_CAMPAIGN/NEW_FUNNEL.
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.
CREATE TABLE IF NOT EXISTS "arvisx"."CreativeLibraryAsset" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "funnelStage" "arvisx"."FunnelLayerKey",
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "creativeAssetData" BYTEA,
    "creativeAssetMimeType" TEXT,
    "creativeVideoData" BYTEA,
    "creativeVideoMimeType" TEXT,
    "creativeCoverImageData" BYTEA,
    "creativeCoverImageMimeType" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeLibraryAsset_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CreativeLibraryAsset_credentialId_fkey'
  ) THEN
    ALTER TABLE "arvisx"."CreativeLibraryAsset"
      ADD CONSTRAINT "CreativeLibraryAsset_credentialId_fkey"
      FOREIGN KEY ("credentialId") REFERENCES "arvisx"."AdCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CreativeLibraryAsset_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "arvisx"."CreativeLibraryAsset"
      ADD CONSTRAINT "CreativeLibraryAsset_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "arvisx"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "CreativeLibraryAsset_credentialId_productName_idx"
  ON "arvisx"."CreativeLibraryAsset" ("credentialId", "productName");
