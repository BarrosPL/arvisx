-- DropForeignKey
ALTER TABLE "ConversationThread" DROP CONSTRAINT "ConversationThread_brandId_fkey";

-- DropIndex
DROP INDEX "ConversationThread_brandId_updatedAt_idx";

-- Consolida conversas antigas por marca em uma unica conversa por usuario antes
-- de remover brandId. A conversa mais antiga vira a canonica e preserva mensagens
-- e propostas das demais conversas.
WITH canonical AS (
  SELECT id,
         FIRST_VALUE(id) OVER (PARTITION BY "userId" ORDER BY "createdAt", id) AS canonical_id
  FROM "ConversationThread"
)
UPDATE "Message" AS message
SET "threadId" = canonical.canonical_id
FROM canonical
WHERE message."threadId" = canonical.id
  AND canonical.id <> canonical.canonical_id;

WITH canonical AS (
  SELECT id,
         FIRST_VALUE(id) OVER (PARTITION BY "userId" ORDER BY "createdAt", id) AS canonical_id
  FROM "ConversationThread"
)
UPDATE "Proposal" AS proposal
SET "threadId" = canonical.canonical_id
FROM canonical
WHERE proposal."threadId" = canonical.id
  AND canonical.id <> canonical.canonical_id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", id) AS position
  FROM "ConversationThread"
)
DELETE FROM "ConversationThread"
USING ranked
WHERE "ConversationThread".id = ranked.id
  AND ranked.position > 1;

-- AlterTable
ALTER TABLE "ConversationThread" DROP COLUMN "brandId";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "brandId" TEXT;

-- AlterTable
ALTER TABLE "Proposal"
ADD COLUMN "creativeAssetData" BYTEA,
ADD COLUMN "creativeAssetMimeType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ConversationThread_userId_key" ON "ConversationThread"("userId");

-- CreateIndex
CREATE INDEX "Message_brandId_createdAt_idx" ON "Message"("brandId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
