#!/usr/bin/env bash
# PostgreSQL for local development without Docker or sudo (Ubuntu/Debian).
# Binaries are unpacked from the distribution packages into ~/.local/opt/postgresql;
# data lives in ~/.local/share/gymflow/pgdata and the server listens on localhost:5433.
#
#   scripts/local-postgres.sh install   # once: download and unpack PostgreSQL 18
#   scripts/local-postgres.sh init      # once: create the cluster, roles and databases
#   scripts/local-postgres.sh start | stop | status | psql
set -euo pipefail

PREFIX="${PG_PREFIX:-$HOME/.local/opt/postgresql}"
BIN="$PREFIX/usr/lib/postgresql/18/bin"
STATE="${GYMFLOW_STATE:-$HOME/.local/share/gymflow}"
DATA="$STATE/pgdata"
PORT="${PG_PORT:-5433}"
export LD_LIBRARY_PATH="$PREFIX/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

case "${1:-status}" in
  install)
    tmp="$(mktemp -d)"
    (cd "$tmp" && apt-get download postgresql-18 postgresql-client-18 libpq5)
    mkdir -p "$PREFIX"
    for deb in "$tmp"/*.deb; do dpkg -x "$deb" "$PREFIX"; done
    rm -rf "$tmp"
    "$BIN/postgres" --version
    ;;
  init)
    [ -d "$DATA" ] && { echo "Cluster already exists at $DATA"; exit 1; }
    mkdir -p "$STATE/pgsock"
    superuser_pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
    "$BIN/initdb" -D "$DATA" -U postgres --auth=scram-sha-256 --pwfile=<(echo "$superuser_pw") -E UTF8 --locale=C.UTF-8
    cat >> "$DATA/postgresql.conf" <<CONF
port = $PORT
listen_addresses = 'localhost'
unix_socket_directories = '$STATE/pgsock'
timezone = 'UTC'
CONF
    "$BIN/pg_ctl" -D "$DATA" -l "$STATE/postgres.log" -w start
    owner_pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
    app_pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
    PGPASSWORD="$superuser_pw" "$BIN/psql" -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q <<SQL
CREATE ROLE gymflow_owner LOGIN PASSWORD '$owner_pw';
CREATE ROLE gymflow_app LOGIN PASSWORD '$app_pw';
CREATE DATABASE gymflow OWNER gymflow_owner;
CREATE DATABASE gymflow_test OWNER gymflow_owner;
CREATE DATABASE gymflow_e2e OWNER gymflow_owner;
SQL
    umask 077
    cat > "$STATE/credentials.env" <<ENV
PG_SUPERUSER_URL=postgres://postgres:$superuser_pw@localhost:$PORT/postgres
OWNER_URL=postgres://gymflow_owner:$owner_pw@localhost:$PORT/gymflow
APP_URL=postgres://gymflow_app:$app_pw@localhost:$PORT/gymflow
TEST_OWNER_URL=postgres://gymflow_owner:$owner_pw@localhost:$PORT/gymflow_test
TEST_APP_URL=postgres://gymflow_app:$app_pw@localhost:$PORT/gymflow_test
ENV
    echo "Credentials written to $STATE/credentials.env (use them in backend/.env and backend/.env.test)."
    ;;
  start) "$BIN/pg_ctl" -D "$DATA" -l "$STATE/postgres.log" -w start ;;
  stop) "$BIN/pg_ctl" -D "$DATA" -w stop ;;
  status) "$BIN/pg_ctl" -D "$DATA" status ;;
  psql) shift; "$BIN/psql" -h localhost -p "$PORT" "$@" ;;
  *) echo "Usage: $0 install|init|start|stop|status|psql"; exit 1 ;;
esac
