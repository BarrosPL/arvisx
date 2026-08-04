-- Chat do agente de geracao de conteudo (Fatia 6 do plano em
-- C:\Users\lcsin\.claude\plans\hidden-zooming-cat.md) - tabelas PROPRIAS, separadas de
-- "arvisx"."ConversationThread"/"Message" (da JAMILE): aquela tabela ja garante "uma
-- thread ativa por usuario" via indice unico parcial (ver migration
-- 20260803193001_conversation_thread_memory) - reaproveitar exigiria relaxar isso pra
-- "uma por usuario+agente", mexendo numa constraint que ja protege uma feature em
-- producao. Enum proprio (ContentMessageRole) pelo mesmo motivo de isolamento total
-- ja usado em Brand/Format/Template/Content (ver 20260804160000_content_kit).
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ContentMessageRole' AND n.nspname = 'content'
  ) THEN
    CREATE TYPE "content"."ContentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "content"."ContentThread" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "ContentThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentThread_userId_idx" ON "content"."ContentThread" ("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "ContentThread_userId_active_key"
  ON "content"."ContentThread" ("userId")
  WHERE "isActive" = true;

CREATE TABLE IF NOT EXISTS "content"."ContentMessage" (
    "id"             TEXT NOT NULL,
    "threadId"       TEXT NOT NULL,
    "role"           "content"."ContentMessageRole" NOT NULL,
    "content"        TEXT NOT NULL,
    "toolName"       TEXT,
    "toolCallId"     TEXT,
    "toolArgsJson"   JSONB,
    "toolResultJson" JSONB,
    "contentId"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentMessage_threadId_createdAt_idx" ON "content"."ContentMessage" ("threadId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContentMessage_threadId_fkey'
  ) THEN
    ALTER TABLE "content"."ContentMessage"
      ADD CONSTRAINT "ContentMessage_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "content"."ContentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Grants pro papel restrito que a aplicacao usa em runtime (mesmo padrao das tabelas
-- anteriores de "content"). Sem sequences aqui - todo id e cuid() gerado pela aplicacao.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "content" TO arvisx_app;
