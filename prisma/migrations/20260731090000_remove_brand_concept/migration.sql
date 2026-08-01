-- Remove o conceito de "Marca" (Brand) do sistema. A conta de anuncio (AdCredential)
-- passa a ser a entidade principal, e a posse do dado vira
-- usuario -> ProviderConnection -> AdCredential -> (metricas/propostas/execucoes).
--
-- Pedido do Renan: atribuir conta a marca era um passo manual que nao agregava nada (na
-- pratica sempre foi 1 conta = 1 marca, criada automaticamente) e impedia o dado de
-- aparecer no dashboard ate alguem atribuir.
--
-- ORDEM IMPORTA: primeiro adiciona credentialId e MIGRA O DADO existente (mapeando pela
-- marca), depois torna obrigatorio, e so no fim derruba as tabelas antigas - assim
-- nenhuma linha real e perdida no caminho.
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.

-- ---------------------------------------------------------------------------
-- 1. Tabelas que JA tinham credentialId: so remover brandId.
-- ---------------------------------------------------------------------------
ALTER TABLE "arvisx"."AdCreative" DROP COLUMN IF EXISTS "brandId";
ALTER TABLE "arvisx"."AdMetricSnapshot" DROP COLUMN IF EXISTS "brandId";
ALTER TABLE "arvisx"."CampaignMetricSnapshot" DROP COLUMN IF EXISTS "brandId";

DROP INDEX IF EXISTS "arvisx"."AdMetricSnapshot_brandId_platform_collectedAt_idx";
DROP INDEX IF EXISTS "arvisx"."AdMetricSnapshot_brandId_platformAdId_idx";
DROP INDEX IF EXISTS "arvisx"."CampaignMetricSnapshot_brandId_platform_collectedAt_idx";
DROP INDEX IF EXISTS "arvisx"."CampaignMetricSnapshot_brandId_platformCampaignId_idx";

CREATE INDEX IF NOT EXISTS "AdMetricSnapshot_credentialId_platform_collectedAt_idx"
  ON "arvisx"."AdMetricSnapshot" ("credentialId", "platform", "collectedAt");
CREATE INDEX IF NOT EXISTS "AdMetricSnapshot_credentialId_platformAdId_idx"
  ON "arvisx"."AdMetricSnapshot" ("credentialId", "platformAdId");
CREATE INDEX IF NOT EXISTS "CampaignMetricSnapshot_credentialId_platform_collectedAt_idx"
  ON "arvisx"."CampaignMetricSnapshot" ("credentialId", "platform", "collectedAt");
CREATE INDEX IF NOT EXISTS "CampaignMetricSnapshot_credentialId_platformCampaignId_idx"
  ON "arvisx"."CampaignMetricSnapshot" ("credentialId", "platformCampaignId");

-- ---------------------------------------------------------------------------
-- 2. Tabelas que precisam GANHAR credentialId, migrando o dado pela marca.
--    Como sempre foi 1 marca = 1 conta (auto-provisionada), pegar a primeira
--    credencial da marca reconstroi o vinculo correto.
-- ---------------------------------------------------------------------------
ALTER TABLE "arvisx"."RankingSnapshot" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;
ALTER TABLE "arvisx"."Proposal" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;
ALTER TABLE "arvisx"."AbTest" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;
ALTER TABLE "arvisx"."ExecutionLog" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;
ALTER TABLE "arvisx"."Message" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;

-- Backfill: so roda se a coluna antiga ainda existir (torna a migration re-executavel).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'arvisx' AND table_name = 'RankingSnapshot' AND column_name = 'brandId'
  ) THEN
    UPDATE "arvisx"."RankingSnapshot" r SET "credentialId" = (
      SELECT c."id" FROM "arvisx"."AdCredential" c WHERE c."brandId" = r."brandId" ORDER BY c."createdAt" LIMIT 1
    ) WHERE r."credentialId" IS NULL;

    UPDATE "arvisx"."Proposal" p SET "credentialId" = (
      SELECT c."id" FROM "arvisx"."AdCredential" c WHERE c."brandId" = p."brandId" ORDER BY c."createdAt" LIMIT 1
    ) WHERE p."credentialId" IS NULL;

    UPDATE "arvisx"."AbTest" a SET "credentialId" = (
      SELECT c."id" FROM "arvisx"."AdCredential" c WHERE c."brandId" = a."brandId" ORDER BY c."createdAt" LIMIT 1
    ) WHERE a."credentialId" IS NULL;

    UPDATE "arvisx"."ExecutionLog" e SET "credentialId" = (
      SELECT c."id" FROM "arvisx"."AdCredential" c WHERE c."brandId" = e."brandId" ORDER BY c."createdAt" LIMIT 1
    ) WHERE e."credentialId" IS NULL;

    UPDATE "arvisx"."Message" m SET "credentialId" = (
      SELECT c."id" FROM "arvisx"."AdCredential" c WHERE c."brandId" = m."brandId" ORDER BY c."createdAt" LIMIT 1
    ) WHERE m."credentialId" IS NULL AND m."brandId" IS NOT NULL;
  END IF;
END
$$;

-- Linhas cuja marca nao tinha conta nenhuma ficam orfas - sao inuteis sem conta
-- (nao ha como saber de que conta de anuncio falavam) e impediriam o NOT NULL abaixo.
DELETE FROM "arvisx"."ExecutionLog" WHERE "credentialId" IS NULL;
DELETE FROM "arvisx"."AbTest" WHERE "credentialId" IS NULL;
DELETE FROM "arvisx"."Proposal" WHERE "credentialId" IS NULL;
DELETE FROM "arvisx"."RankingSnapshot" WHERE "credentialId" IS NULL;
-- Message.credentialId e opcional (mensagem sem conta clara e valida) - nao apaga.

ALTER TABLE "arvisx"."RankingSnapshot" ALTER COLUMN "credentialId" SET NOT NULL;
ALTER TABLE "arvisx"."Proposal" ALTER COLUMN "credentialId" SET NOT NULL;
ALTER TABLE "arvisx"."AbTest" ALTER COLUMN "credentialId" SET NOT NULL;
ALTER TABLE "arvisx"."ExecutionLog" ALTER COLUMN "credentialId" SET NOT NULL;

ALTER TABLE "arvisx"."RankingSnapshot" DROP COLUMN IF EXISTS "brandId";
ALTER TABLE "arvisx"."Proposal" DROP COLUMN IF EXISTS "brandId";
ALTER TABLE "arvisx"."AbTest" DROP COLUMN IF EXISTS "brandId";
ALTER TABLE "arvisx"."ExecutionLog" DROP COLUMN IF EXISTS "brandId";
ALTER TABLE "arvisx"."Message" DROP COLUMN IF EXISTS "brandId";

DROP INDEX IF EXISTS "arvisx"."RankingSnapshot_brandId_computedAt_idx";
DROP INDEX IF EXISTS "arvisx"."Proposal_brandId_status_idx";
DROP INDEX IF EXISTS "arvisx"."ExecutionLog_brandId_executedAt_idx";
DROP INDEX IF EXISTS "arvisx"."Message_brandId_createdAt_idx";

CREATE INDEX IF NOT EXISTS "RankingSnapshot_credentialId_computedAt_idx"
  ON "arvisx"."RankingSnapshot" ("credentialId", "computedAt");
CREATE INDEX IF NOT EXISTS "Proposal_credentialId_status_idx"
  ON "arvisx"."Proposal" ("credentialId", "status");
CREATE INDEX IF NOT EXISTS "ExecutionLog_credentialId_executedAt_idx"
  ON "arvisx"."ExecutionLog" ("credentialId", "executedAt");
CREATE INDEX IF NOT EXISTS "Message_credentialId_createdAt_idx"
  ON "arvisx"."Message" ("credentialId", "createdAt");

-- ---------------------------------------------------------------------------
-- 3. SchedulerBrandResult -> SchedulerAccountResult
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "arvisx"."SchedulerAccountResult" (
  "id"             TEXT NOT NULL,
  "schedulerRunId" TEXT NOT NULL,
  "credentialId"   TEXT NOT NULL,
  "outcome"        TEXT NOT NULL,
  "proposalId"     TEXT,
  "errorMessage"   TEXT,
  CONSTRAINT "SchedulerAccountResult_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'arvisx' AND table_name = 'SchedulerBrandResult'
  ) THEN
    INSERT INTO "arvisx"."SchedulerAccountResult" ("id", "schedulerRunId", "credentialId", "outcome", "proposalId", "errorMessage")
    SELECT s."id", s."schedulerRunId",
           (SELECT c."id" FROM "arvisx"."AdCredential" c WHERE c."brandId" = s."brandId" ORDER BY c."createdAt" LIMIT 1),
           s."outcome", s."proposalId", s."errorMessage"
    FROM "arvisx"."SchedulerBrandResult" s
    WHERE EXISTS (SELECT 1 FROM "arvisx"."AdCredential" c WHERE c."brandId" = s."brandId")
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END
$$;

DROP TABLE IF EXISTS "arvisx"."SchedulerBrandResult";

-- ---------------------------------------------------------------------------
-- 4. Derruba o que sobrou do conceito de marca.
--    FirewallLog vai junto: o firewall por palavra-chave ja era codigo morto (nenhum
--    caminho o chamava - ver comentario em lib/agent/orchestrator.ts), e so existia
--    ancorado em Brand.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "arvisx"."FirewallLog";
ALTER TABLE "arvisx"."AdCredential" DROP COLUMN IF EXISTS "brandId";
DROP TABLE IF EXISTS "arvisx"."BrandAccess";
DROP TABLE IF EXISTS "arvisx"."Brand";
DROP TYPE IF EXISTS "arvisx"."BrandRole";
DROP TYPE IF EXISTS "arvisx"."BrandStatus";

-- ---------------------------------------------------------------------------
-- 5. Chaves estrangeiras novas.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('RankingSnapshot', 'RankingSnapshot_credentialId_fkey', 'CASCADE'),
      ('Proposal',        'Proposal_credentialId_fkey',        'CASCADE'),
      ('AbTest',          'AbTest_credentialId_fkey',          'CASCADE'),
      ('ExecutionLog',    'ExecutionLog_credentialId_fkey',    'CASCADE'),
      ('SchedulerAccountResult', 'SchedulerAccountResult_credentialId_fkey', 'CASCADE')
    ) AS t(tbl, cname, ondelete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.cname) THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY ("credentialId") REFERENCES %I."AdCredential"("id") ON DELETE %s ON UPDATE CASCADE',
        'arvisx', fk.tbl, fk.cname, 'arvisx', fk.ondelete
      );
    END IF;
  END LOOP;

  -- Message.credentialId e opcional - SET NULL em vez de CASCADE (apagar uma conta nao
  -- deve apagar o historico de conversa, so desvincular).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_credentialId_fkey') THEN
    ALTER TABLE "arvisx"."Message"
      ADD CONSTRAINT "Message_credentialId_fkey"
      FOREIGN KEY ("credentialId") REFERENCES "arvisx"."AdCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchedulerAccountResult_schedulerRunId_fkey') THEN
    ALTER TABLE "arvisx"."SchedulerAccountResult"
      ADD CONSTRAINT "SchedulerAccountResult_schedulerRunId_fkey"
      FOREIGN KEY ("schedulerRunId") REFERENCES "arvisx"."SchedulerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- A aplicacao roda como arvisx_app (sem BYPASSRLS) - a tabela nova precisa do grant.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'arvisx_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "arvisx"."SchedulerAccountResult" TO arvisx_app;
  END IF;
END
$$;
