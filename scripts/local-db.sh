#!/usr/bin/env bash
set -euo pipefail

CONTAINER=lead-radar-postgres
PORT="${LEAD_RADAR_DB_PORT:-55432}"
URL="postgresql://postgres:postgres@localhost:${PORT}/lead_radar"

case "${1:-}" in
  start)
    if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      docker start "$CONTAINER" >/dev/null
    else
      docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lead_radar -p "$PORT:5432" postgres:16-alpine >/dev/null
    fi
    for _ in $(seq 1 30); do
      docker exec "$CONTAINER" pg_isready -U postgres -d lead_radar >/dev/null 2>&1 && break
      sleep 1
    done
    echo "$URL"
    ;;
  migrate)
    TEST_DATABASE_URL="$URL" deno task db:migrate
    ;;
  reset)
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d lead_radar <<'SQL' >/dev/null
drop schema public cascade;
create schema public;
SQL
    TEST_DATABASE_URL="$URL" deno task db:migrate
    ;;
  stop)
    docker rm -f "$CONTAINER" >/dev/null
    ;;
  *)
    echo "usage: $0 start|migrate|reset|stop" >&2
    exit 2
    ;;
esac
