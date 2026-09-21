#!/bin/sh
# O Dokploy recria este servico quando o baseline muda. Ele fica separado do
# runtime para que a credencial administrativa nunca chegue ao app ou worker.
set -eu

: "${SUPABASE_DB_ADMIN_URL:?configure SUPABASE_DB_ADMIN_URL}"

echo "[schema] preparando extensoes obrigatorias"
psql "$SUPABASE_DB_ADMIN_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;
SQL

echo "[schema] aplicando baseline.sql"
psql "$SUPABASE_DB_ADMIN_URL" -X -q -v ON_ERROR_STOP=1 -f /app/supabase/baseline.sql
echo "[schema] baseline concluido"
