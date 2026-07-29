-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "SystemRole" NOT NULL DEFAULT 'USER',
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- RLS: painel de administracao de usuarios
--
-- Objetivo: mesmo que uma rota /api/admin/* futura esqueca de checar requireAdmin() no
-- codigo da aplicacao, o Postgres tem que recusar a escrita sozinho. As funcoes abaixo
-- reconsultam a propria tabela "User" pelo id setado em app.current_user_id (via
-- set_config, escopado a transacao/SET LOCAL - ver src/lib/db/withUserContext.ts) -
-- nunca confiam numa flag "sou admin" calculada pela aplicacao.
--
-- Bootstrap: enquanto NAO existir nenhum admin ativo no sistema, INSERT/UPDATE/DELETE
-- ficam liberados sem contexto nenhum - cobre o prisma/seed.ts criando o primeiro
-- usuario de negocio e o prisma/bootstrapAdmin.ts criando o primeiro admin de verdade,
-- em qualquer ordem. Essa janela fecha para sempre assim que o primeiro admin existir.
CREATE FUNCTION user_rls_no_admin_yet() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM "User" WHERE role = 'ADMIN' AND "disabledAt" IS NULL
  );
$$;

CREATE FUNCTION user_rls_current_user_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "User"
    WHERE id = current_setting('app.current_user_id', true)
      AND role = 'ADMIN'
      AND "disabledAt" IS NULL
  );
$$;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

-- Leitura nunca foi o problema (passwordHash nunca sai da API) e o login precisa achar
-- a linha pelo email antes de saber quem e o usuario - sem isso, ninguem conseguiria logar.
CREATE POLICY user_select_all ON "User"
  FOR SELECT
  USING (true);

CREATE POLICY user_insert ON "User"
  FOR INSERT
  WITH CHECK (user_rls_no_admin_yet() OR user_rls_current_user_is_admin());

CREATE POLICY user_update ON "User"
  FOR UPDATE
  USING (
    id = current_setting('app.current_user_id', true)
    OR user_rls_no_admin_yet()
    OR user_rls_current_user_is_admin()
  )
  WITH CHECK (
    id = current_setting('app.current_user_id', true)
    OR user_rls_no_admin_yet()
    OR user_rls_current_user_is_admin()
  );

CREATE POLICY user_delete ON "User"
  FOR DELETE
  USING (user_rls_no_admin_yet() OR user_rls_current_user_is_admin());
