-- Tabela nova pra servir blob publicamente sem autenticacao (ver comentario do model
-- PublicMediaAsset em schema.prisma pro motivo: thumbnail de anuncio em video precisa
-- de URL publica que a Meta consiga baixar por HTTP comum).
--
-- IF NOT EXISTS por padrao neste projeto desde o incidente de producao de 2026-07-29.

CREATE TABLE IF NOT EXISTS "arvisx"."PublicMediaAsset" (
    "id" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicMediaAsset_pkey" PRIMARY KEY ("id")
);
