-- Memoria de longo prazo do chat: ConversationThread deixa de ser "uma unica pra
-- sempre por usuario" e ganha resumo cumulativo, pra corrigir a perda silenciosa de
-- contexto (ver runAgentTurn em orchestrator.ts - so os ultimos 40 mensagens iam pro
-- modelo, sem nada preservar o que saia da janela).
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.

ALTER TABLE "arvisx"."ConversationThread" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "arvisx"."ConversationThread" ADD COLUMN IF NOT EXISTS "contextSummary" TEXT;
ALTER TABLE "arvisx"."ConversationThread" ADD COLUMN IF NOT EXISTS "summarizedUpToMessageId" TEXT;

-- A constraint unica antiga (uma thread por usuario, sem excecao) sai; o novo indice
-- parcial abaixo garante a mesma coisa so ENQUANTO isActive=true, permitindo "nova
-- conversa" (thread antiga vira isActive=false, nunca apagada).
ALTER TABLE "arvisx"."ConversationThread" DROP CONSTRAINT IF EXISTS "ConversationThread_userId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationThread_userId_active_key"
  ON "arvisx"."ConversationThread" ("userId")
  WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "ConversationThread_userId_idx" ON "arvisx"."ConversationThread" ("userId");
