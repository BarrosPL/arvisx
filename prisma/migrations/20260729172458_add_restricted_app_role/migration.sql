-- A RLS da migration anterior (add_user_admin_rls) so tem efeito real se a conexao
-- que roda a aplicacao NAO for superusuario nem tiver BYPASSRLS - Postgres ignora RLS
-- para essas conexoes independente de ENABLE/FORCE ROW LEVEL SECURITY. O papel usado
-- ate aqui (o mesmo do DATABASE_URL/migrations) e superusuario por padrao da imagem
-- oficial do Postgres, entao a RLS estava sendo ignorada silenciosamente. Este papel
-- novo, restrito, e o que a aplicacao (src/lib/prisma.ts) passa a usar em runtime -
-- migrations continuam rodando com o papel antigo (precisa de privilegio de dono pra
-- ALTER TABLE/CREATE POLICY/CREATE FUNCTION).
--
-- A senha deste papel e definida manualmente fora desta migration (ALTER ROLE ...
-- PASSWORD), nunca commitada - ver instrucoes de deploy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'arvisx_app') THEN
    CREATE ROLE arvisx_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO arvisx_app', current_database());
END
$$;

-- current_schema() resolve pro schema real definido no ?schema=... da connection
-- string usada por `prisma migrate deploy` - nunca hardcoded "public", porque o schema
-- pode ter outro nome (ex: "arvisx") dependendo do ambiente.
DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO arvisx_app', target_schema);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO arvisx_app', target_schema);
END
$$;

GRANT EXECUTE ON FUNCTION user_rls_no_admin_yet() TO arvisx_app;
GRANT EXECUTE ON FUNCTION user_rls_current_user_is_admin() TO arvisx_app;

-- Cobre tabelas que futuras migrations vierem a criar, rodando com o mesmo papel que
-- roda esta migration (o papel de migrations, seja qual for o nome em cada ambiente).
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arvisx_app',
    current_user
  );
END
$$;
