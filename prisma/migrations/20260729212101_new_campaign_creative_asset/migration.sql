-- Proposal.creativeAssetData/creativeAssetMimeType ja existiam em schema.prisma (pensadas
-- pra guardar a imagem do anuncio que um humano anexa numa proposta NEW_CAMPAIGN antes de
-- aprovar) mas nunca ganharam uma migration - esta so fecha esse debito, sem mudanca de
-- schema alem da ja declarada no schema.prisma.
-- AlterTable
ALTER TABLE "arvisx"."Proposal"
  ADD COLUMN "creativeAssetData" BYTEA,
  ADD COLUMN "creativeAssetMimeType" TEXT;

-- Necessario pra executor.ts poder gravar ExecutionLog.action = NEW_CAMPAIGN quando uma
-- campanha nova de verdade for criada (Meta ou Google).
-- AlterEnum
ALTER TYPE "arvisx"."ExecutionAction" ADD VALUE 'NEW_CAMPAIGN';
