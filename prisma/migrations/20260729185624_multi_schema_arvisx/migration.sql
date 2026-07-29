-- Move o schema logico do app de "public" pra "arvisx" (multiSchema do Prisma:
-- @@schema("arvisx") em todo model/enum do schema.prisma).
--
-- Motivo: descobrimos que o Prisma Client (client-engine-runtime, Prisma 7) qualifica
-- toda query de modelo com um schema fixo determinado em BUILD TIME a partir do
-- schema.prisma - NUNCA a partir do search_path da conexao em runtime. Sem @@schema
-- declarado, ele assume "public" incondicionalmente, mesmo que a connection string
-- tenha ?schema=arvisx ou options=-c search_path=arvisx. So o motor de MIGRATIONS
-- (prisma migrate) respeita o search_path da conexao pra CREATE TABLE/CREATE TYPE sem
-- schema qualificado - por isso as tabelas ja foram parar em "arvisx" de verdade em
-- producao (onde a connection string ja tinha ?schema=arvisx), mas o app rodando
-- continuava batendo em "public"."User", que nunca existiu la.
--
-- Os blocos abaixo sao idempotentes: se o objeto ja estiver em "arvisx" (caso de
-- producao), nao fazem nada; se ainda estiver em "public" (caso de um ambiente local
-- que nunca teve @@schema antes), movem de verdade. Seguro rodar nos dois cenarios.
CREATE SCHEMA IF NOT EXISTS "arvisx";

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'User', 'BrandAccess', 'Brand', 'ProviderConnection', 'AdCredential',
    'AdCreative', 'AdMetricSnapshot', 'RankingSnapshot', 'ConversationThread',
    'Message', 'Proposal', 'AbTest', 'ExecutionLog', 'SchedulerRun',
    'SchedulerBrandResult', 'FirewallLog'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I SET SCHEMA arvisx', 'public', tbl);
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  typ text;
BEGIN
  FOREACH typ IN ARRAY ARRAY[
    'BrandStatus', 'BrandRole', 'Platform', 'CredentialStatus', 'CollectionState',
    'Verdict', 'SystemRole', 'MessageRole', 'ProposalType', 'ProposalStatus',
    'ExecutionAction', 'ExecutionStatus'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = typ
    ) THEN
      EXECUTE format('ALTER TYPE %I.%I SET SCHEMA arvisx', 'public', typ);
    END IF;
  END LOOP;
END
$$;

-- As duas funcoes de RLS (migration add_user_admin_rls) e a tabela _prisma_migrations
-- em si continuam em "public" de proposito - Prisma nao gerencia elas via @@schema, e
-- as funcoes ja usam nomes sem qualificar schema (resolvem via search_path na hora de
-- rodar migrations, que continua tendo "public" como fallback - ver migration
-- add_restricted_app_role, que ja concede grant no schema resolvido dinamicamente).

-- Os grants da migration add_restricted_app_role foram dados no schema resolvido
-- NAQUELA epoca (current_schema(), que dependia do ?schema= da connection string usada
-- por migrate deploy) - como agora o schema logico do app e sempre "arvisx" (fixado via
-- @@schema, nao depende mais de connection string), concede aqui direto, sem precisar
-- resolver dinamicamente.
GRANT USAGE ON SCHEMA arvisx TO arvisx_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA arvisx TO arvisx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA arvisx GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arvisx_app;
