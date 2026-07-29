-- Proposal.creativeAssetData/creativeAssetMimeType ja existiam em schema.prisma (pensadas
-- pra guardar a imagem do anuncio que um humano anexa numa proposta NEW_CAMPAIGN antes de
-- aprovar) mas nunca ganharam uma migration - esta so fecha esse debito, sem mudanca de
-- schema alem da ja declarada no schema.prisma.
-- IF NOT EXISTS nas duas instrucoes: producao ja tinha essas colunas (aplicadas por fora
-- do historico de migrations em algum momento anterior, descoberto quando esta migration
-- quebrou em producao com "column already exists" - o ambiente local nao tinha, entao a
-- versao sem IF NOT EXISTS passou despercebida ali) - isso deixa a migration segura de
-- rodar em qualquer um dos dois estados.
-- AlterTable
ALTER TABLE "arvisx"."Proposal"
  ADD COLUMN IF NOT EXISTS "creativeAssetData" BYTEA,
  ADD COLUMN IF NOT EXISTS "creativeAssetMimeType" TEXT;

-- Necessario pra executor.ts poder gravar ExecutionLog.action = NEW_CAMPAIGN quando uma
-- campanha nova de verdade for criada (Meta ou Google).
-- AlterEnum
ALTER TYPE "arvisx"."ExecutionAction" ADD VALUE IF NOT EXISTS 'NEW_CAMPAIGN';
