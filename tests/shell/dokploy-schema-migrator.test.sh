#!/usr/bin/env bash
# Cerca da garantia central do compose Dokploy: schema novo antes do runtime.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail=0
check() {
  if "${@:2}" >/dev/null 2>&1; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; fail=1; fi
}

COMPOSE="docker-compose.dokploy.yml"
SCRIPT="scripts/dokploy-aplicar-schema.sh"

echo "dokploy: o schema e aplicado antes dos processos de runtime"
check "ha imagem efemera do migrator" test -f Dockerfile.migrator
check "o migrator usa psql com falha fechada" grep -q 'ON_ERROR_STOP=1' "$SCRIPT"
check "o migrator aplica o baseline versionado" grep -q '/app/supabase/baseline.sql' "$SCRIPT"
check "o migrator prepara as tres extensoes" grep -q 'vector with schema public' "$SCRIPT"
admin_fora_do_runtime() {
  ! sed -n '1,/^services:/p' "$COMPOSE" | grep -q 'SUPABASE_DB_ADMIN_URL:'
}

migrator_recebe_admin() {
  grep -q 'SUPABASE_DB_ADMIN_URL: \${SUPABASE_DB_ADMIN_URL:?configure SUPABASE_DB_ADMIN_URL}' "$COMPOSE"
}

check "a URL administrativa nao vai ao runtime compartilhado" admin_fora_do_runtime
check "o migrator recebe a URL administrativa" migrator_recebe_admin

app_espera_migrator() {
  awk '/^  app:/{inside=1} /^  worker:/{inside=0} inside' "$COMPOSE" |
    grep -A1 'migrator:' |
    grep -q 'service_completed_successfully'
}

worker_espera_migrator() {
  awk '/^  worker:/{inside=1} /^  scheduler:/{inside=0} inside' "$COMPOSE" |
    grep -A1 'migrator:' |
    grep -q 'service_completed_successfully'
}

check "o app espera a conclusao do migrator" app_espera_migrator
check "o worker espera a conclusao do migrator" worker_espera_migrator

if [ "$fail" -eq 0 ]; then
  echo "OK — o runtime nao parte com schema potencialmente antigo."
else
  echo "FALHOU."
fi
exit "$fail"
