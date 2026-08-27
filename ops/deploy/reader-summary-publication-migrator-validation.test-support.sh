#!/usr/bin/env bash

publication_url_with_password() {
  local password=$1
  printf '%s%s:%s@%s:25060/social_monitor?%s\n' \
    'postgresql://' "$MIGRATOR_ROLE" "$password" "$DATABASE_HOST" \
    'connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
}

runtime_url_for() {
  local role=$1
  local password=$2
  printf 'postgresql://%s:%s@%s:25060/social_monitor?%s\n' \
    "$role" "$password" "$DATABASE_HOST" \
    'connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
}
