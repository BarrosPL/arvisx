-- AdMetricSnapshot.adSetName - nome do AdSet (Meta) / AdGroup (Google), nivel
-- intermediario entre campanha e anuncio que nunca tinha sido coletado (so o id).
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de
-- 2026-07-29 (colunas ja existentes em producao por caminho fora do historico de
-- migrations quebraram um deploy anterior).
-- AlterTable
ALTER TABLE "arvisx"."AdMetricSnapshot"
  ADD COLUMN IF NOT EXISTS "adSetName" TEXT;
