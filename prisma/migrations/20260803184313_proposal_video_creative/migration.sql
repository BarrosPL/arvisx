-- Segundo caminho de anexo de criativo pra NEW_CAMPAIGN (Meta): video + capa, paralelo
-- ao caminho de imagem ja existente (creativeAssetData/creativeAssetMimeType). Uma
-- proposta usa um ou outro - nunca os dois -, entao os 4 campos ficam todos nullable,
-- sem CHECK constraint de exclusividade (a validacao de "so um dos dois" fica na
-- aplicacao, na rota de upload, igual o resto das regras de negocio deste projeto).
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.

ALTER TABLE "arvisx"."Proposal" ADD COLUMN IF NOT EXISTS "creativeVideoData" BYTEA;
ALTER TABLE "arvisx"."Proposal" ADD COLUMN IF NOT EXISTS "creativeVideoMimeType" TEXT;
ALTER TABLE "arvisx"."Proposal" ADD COLUMN IF NOT EXISTS "creativeCoverImageData" BYTEA;
ALTER TABLE "arvisx"."Proposal" ADD COLUMN IF NOT EXISTS "creativeCoverImageMimeType" TEXT;
