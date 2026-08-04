-- A migration 20260804140000_content_links concedeu GRANT em TABELAS do schema
-- "content", mas nao em SEQUENCES - objeto separado no Postgres. Todo o resto do
-- projeto usa cuid() (gerado pela aplicacao, sem sequence), entao isso nunca apareceu
-- antes: BioEvent.id (BIGSERIAL) e o primeiro auto-increment do sistema. Sem USAGE na
-- sequence, INSERT falha com "permission denied for sequence BioEvent_id_seq" mesmo
-- com INSERT liberado na tabela - Postgres exige USAGE na sequence pra chamar
-- nextval() (o que BIGSERIAL faz implicitamente a cada INSERT sem id explicito).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "content" TO arvisx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "content" GRANT USAGE, SELECT ON SEQUENCES TO arvisx_app;
