#!/usr/bin/env bash
# Prova le migrazioni su un Postgres locale: ricrea il database "gp_test", applica lo stub di Supabase,
# tutte le migrazioni, i dati di esempio e i test. Uso: supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-gp_test}
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
if [ "$(id -u)" = "0" ]; then RUN=(su postgres -c); else RUN=(bash -c); fi

"${RUN[@]}" "dropdb --if-exists $DB && createdb $DB"
apply() { "${RUN[@]}" "$(printf '%q ' "${PSQL[@]}") -f $(printf '%q' "$PWD/$1")"; }

apply tests/supabase_stub.sql
for f in migrations/*.sql; do echo "→ $f"; apply "$f"; done
echo "→ seed.sql"; apply seed.sql > /dev/null
for f in tests/test_*.sql; do echo "→ $f"; apply "$f"; done
echo "Tutto a posto."
