-- Revisao conversacional (Fatia 7 do plano) - acumula overrides de setPalette/
-- setStyle por cima da marca/autoFit a cada re-render, sem escrever de volta no Brand
-- (override vale so pra esta peca).
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.

ALTER TABLE "content"."Content" ADD COLUMN IF NOT EXISTS "paletteOverrides" JSONB;
ALTER TABLE "content"."Content" ADD COLUMN IF NOT EXISTS "styleOverrides" JSONB;
