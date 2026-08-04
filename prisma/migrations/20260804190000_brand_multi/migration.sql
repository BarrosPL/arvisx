-- Multi-marca por usuario + campo "Objetivo" (pedido do Renan a partir dos prints do
-- bestcontent.ai) - Brand.ownerUserId nunca teve constraint de unicidade, entao nao
-- ha nada a "destravar" no schema em si, so os 3 campos novos.
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'BrandGoal' AND n.nspname = 'content'
  ) THEN
    CREATE TYPE "content"."BrandGoal" AS ENUM ('VENDER', 'CONSTRUIR_AUTORIDADE', 'AUMENTAR_ENGAJAMENTO', 'GERAR_LEADS');
  END IF;
END
$$;

ALTER TABLE "content"."Brand" ADD COLUMN IF NOT EXISTS "primaryGoal" "content"."BrandGoal";
ALTER TABLE "content"."Brand" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'BR';
ALTER TABLE "content"."Brand" ADD COLUMN IF NOT EXISTS "visualStyleDescription" TEXT;
