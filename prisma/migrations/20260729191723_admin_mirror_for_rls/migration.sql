-- Descoberta ao vivo (debug de producao): o motor novo do Prisma 7 (client-engine-
-- runtime) quebra em create/update/delete de "User" sempre que a policy de RLS da
-- PROPRIA tabela "User" contem uma subquery que consulta "User" de novo (o padrao
-- self-referencing usado em add_user_admin_rls: `EXISTS (SELECT 1 FROM "User" ...)`),
-- mesmo que a policy de SELECT seja totalmente aberta. O erro that aparece e enganoso -
-- "the table User does not exist" - e nao tem nada a ver com schema; confirmado
-- comparando com uma subquery identica apontando pra uma tabela DIFERENTE, que funciona
-- normalmente. So afeta escrita (create/update/updateMany/delete); leitura (find*)
-- nunca teve problema.
--
-- Correcao: mover a verificacao "e admin?"/"existe algum admin?" pra uma tabela espelho
-- separada ("AdminMirror"), mantida automaticamente por trigger sempre que role/
-- disabledAt mudar em "User". As policies de "User" passam a consultar "AdminMirror"
-- em vez de "User" - RLS continua real (reconsultada no banco a cada escrita), so que
-- sem o padrao que quebra o motor do Prisma.
-- Fixado explicitamente porque a engine de migrate do Prisma seta o search_path da
-- conexao a partir do ?schema= da connection string, sobrescrevendo qualquer default
-- de nivel de papel (ALTER ROLE ... SET search_path) - _prisma_migrations continua so
-- em "public", entao a connection string usada por migrate deploy tem que apontar pra
-- "public" (senao o proprio bookkeeping de migrations quebra), mas as tabelas do app
-- estao em "arvisx" - precisa dos dois na busca.
SET search_path TO arvisx, public;

CREATE TABLE "AdminMirror" (
  "userId" TEXT PRIMARY KEY
);

INSERT INTO "AdminMirror" ("userId")
SELECT id FROM "User" WHERE role = 'ADMIN' AND "disabledAt" IS NULL;

-- SECURITY DEFINER com search_path fixo: convencao de seguranca padrao do Postgres pra
-- funcoes SECURITY DEFINER, evita que um search_path diferente na sessao chamadora
-- redirecione as referencias de tabela sem schema desta funcao.
CREATE FUNCTION sync_admin_mirror() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arvisx AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "AdminMirror" WHERE "userId" = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.role = 'ADMIN' AND NEW."disabledAt" IS NULL THEN
    INSERT INTO "AdminMirror" ("userId") VALUES (NEW.id)
      ON CONFLICT ("userId") DO NOTHING;
  ELSE
    DELETE FROM "AdminMirror" WHERE "userId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_admin_mirror_sync
AFTER INSERT OR UPDATE OR DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION sync_admin_mirror();

CREATE OR REPLACE FUNCTION user_rls_no_admin_yet() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "AdminMirror");
$$;

CREATE OR REPLACE FUNCTION user_rls_current_user_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "AdminMirror" WHERE "userId" = current_setting('app.current_user_id', true)
  );
$$;

GRANT SELECT ON "AdminMirror" TO arvisx_app;

-- Recria a policy de UPDATE (identica a add_user_admin_rls) - as funcoes que ela chama
-- ja foram redefinidas acima pra usar "AdminMirror", entao o comportamento e o mesmo,
-- so que sem o padrao self-referencing que quebrava o Prisma.
DROP POLICY IF EXISTS user_update ON "User";
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
