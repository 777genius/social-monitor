#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh. Publication migrations need
# a role-creating admin connection that is never placed in production.env or
# in a Docker command argument. The secret file contains only the PostgreSQL
# URL and is mounted read-only into short-lived migration/bootstrap containers.

deploy_reader_summary_publication_migrations() {
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local runtime_role=social_monitor_app
  local mode owner

  [[ -f $secret && ! -L $secret ]] ||
    fail 'reader summary publication admin URL secret is unavailable'
  [[ -s $secret ]] || fail 'reader summary publication admin URL is empty'
  mode=$(stat -c '%a' "$secret")
  owner=$(stat -c '%U' "$secret")
  [[ $owner == root && $mode =~ ^[46]00$ ]] ||
    fail 'reader summary publication admin URL must be root-owned mode 0400 or 0600'
  [[ -f $ca_certificate && ! -L $ca_certificate ]] ||
    fail 'managed PostgreSQL CA certificate is unavailable'

  run_reader_summary_publication_admin_sql \
    "$secret" "$ca_certificate" "$runtime_role" pre

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  "${COMPOSE[@]}" --profile app run -T --rm --no-deps \
    --user 0:0 \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    migrate sh -c '
      set -eu
      DATABASE_URL=$(cat /run/secrets/reader-summary-publication-admin-url)
      export DATABASE_URL
      exec npm run migrate:deploy
    '

  run_reader_summary_publication_admin_sql \
    "$secret" "$ca_certificate" "$runtime_role" post
}

run_reader_summary_publication_admin_sql() {
  local secret=$1
  local ca_certificate=$2
  local runtime_role=$3
  local phase=$4
  local sql=$REPO/ops/deploy/reader-summary-publication-${phase}-migration.sql
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15

  [[ $phase == pre || $phase == post ]] ||
    fail 'reader summary publication bootstrap phase is invalid'
  [[ -f $sql && ! -L $sql ]] ||
    fail "reader summary publication $phase-migration SQL is unavailable"

  docker run --rm \
    --user 0:0 \
    --env PGAPPNAME="social-monitor/publication-$phase-migration" \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    -v "$sql:/run/social-monitor-db/publication-migration.sql:ro" \
    "$postgres_image" \
    sh -c '
      set -eu
      PGDATABASE=$(cat /run/secrets/reader-summary-publication-admin-url)
      export PGDATABASE
      exec psql -X -v ON_ERROR_STOP=1 \
        --set=runtime_role="$1" \
        --file=/run/social-monitor-db/publication-migration.sql
    ' _ "$runtime_role"
}
