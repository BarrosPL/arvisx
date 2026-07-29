-- Ate agora nada impedia duas ProviderConnection para o mesmo (userId, platform) -
-- o callback OAuth sempre fazia INSERT, nunca verificava se ja existia uma conexao pra
-- aquela plataforma. Isso gerou conexoes Meta/Google duplicadas em producao pro mesmo
-- login. Antes de travar isso com uma constraint, faz o merge de qualquer duplicata que
-- ja exista: mantem a conexao CONNECTED mais recente por (userId, platform), reatribui
-- as AdCredential das duplicatas descartadas pra ela (evita perder contas ja atribuidas
-- a marcas via AdCredential.providerConnectionId -> Cascade apagaria isso se so
-- deletassemos a duplicata direto) e so entao apaga as duplicatas.
DO $$
DECLARE
  dup RECORD;
  keeper_id TEXT;
BEGIN
  FOR dup IN
    SELECT "userId", platform
    FROM "arvisx"."ProviderConnection"
    GROUP BY "userId", platform
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM "arvisx"."ProviderConnection"
    WHERE "userId" = dup."userId" AND platform = dup.platform
    ORDER BY (status = 'CONNECTED') DESC, "createdAt" DESC
    LIMIT 1;

    UPDATE "arvisx"."AdCredential"
    SET "providerConnectionId" = keeper_id
    WHERE "providerConnectionId" IN (
      SELECT id FROM "arvisx"."ProviderConnection"
      WHERE "userId" = dup."userId" AND platform = dup.platform AND id <> keeper_id
    );

    DELETE FROM "arvisx"."ProviderConnection"
    WHERE "userId" = dup."userId" AND platform = dup.platform AND id <> keeper_id;
  END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConnection_userId_platform_key" ON "arvisx"."ProviderConnection"("userId", "platform");
