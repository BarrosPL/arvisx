-- executor.ts grava ExecutionLog.action = proposal.type as ExecutionAction - sem este
-- valor, executar uma proposta NEW_FUNNEL falharia em runtime com enum invalido
-- (o cast "as ExecutionAction" e so TypeScript, nao protege o Postgres).
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ExecutionAction' AND n.nspname = 'arvisx' AND e.enumlabel = 'NEW_FUNNEL'
  ) THEN
    ALTER TYPE "arvisx"."ExecutionAction" ADD VALUE 'NEW_FUNNEL';
  END IF;
END
$$;
