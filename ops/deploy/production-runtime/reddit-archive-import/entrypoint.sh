#!/bin/sh
set -eu
test "$#" = 6 || exit 78
semantic_key=$1
day=$2
plan_sha=$3
packet_sha=$4
correlation_id=$5
claim_sha=$6
case "$day" in ????-??-??) ;; *) exit 78 ;; esac
case "$day" in *[!0-9-]*) exit 78 ;; esac
for value in "$semantic_key" "$plan_sha" "$packet_sha" "$claim_sha"; do
  test "${#value}" = 64 || exit 78
  case "$value" in *[!0-9a-f]*|'') exit 78 ;; esac
done
case "$correlation_id" in reddit-archive-import-????????-????-????-????-????????????) ;; *) exit 78 ;; esac
case "$correlation_id" in *[!a-z0-9-]*) exit 78 ;; esac
test "$(id -u)" = 0 || exit 78
password_file=/run/secrets/postgres-collection-password
ca_file=/run/postgres-ca.crt
test -f "$password_file" && test ! -L "$password_file" && test -s "$password_file" || exit 78
test -f "$ca_file" && test ! -L "$ca_file" && test -s "$ca_file" || exit 78
test "$(stat -c '%u:%g:%a:%h' "$password_file")" = 0:0:600:1 || exit 78
IFS= read -r db_password < "$password_file"
test "${#db_password}" = 64 || exit 78
case "$db_password" in *[!0-9a-f]*|'') exit 78 ;; esac
grep -q '^-----BEGIN CERTIFICATE-----$' "$ca_file" || exit 78
grep -q '^-----END CERTIFICATE-----$' "$ca_file" || exit 78
install -m 0644 "$ca_file" /tmp/postgres-ca.crt
export NODE_ENV=production SOCIAL_MONITOR_RUNTIME_PROFILE=beta
export POSTGRES_RUNTIME_PROCESS=collection POSTGRES_RUNTIME_POOL_MIN=0 POSTGRES_RUNTIME_POOL_MAX=2
export NODE_EXTRA_CA_CERTS=/tmp/postgres-ca.crt
DATABASE_URL=$(printf '%s%s%s' 'postgresql://social_monitor_collection_v2:' "$db_password" '@host.docker.internal:5432/social_monitor?sslmode=verify-full&sslrootcert=/tmp/postgres-ca.crt')
export DATABASE_URL
unset db_password password_file ca_file value
exec node /app/dist/scripts/import-reddit-archive-missing.js --native-write \
  "/input-source/$day" "$day" /var/lib/platform/social-monitor/collection/reddit-archive-qualified-journals \
  "$semantic_key" "$plan_sha" "$packet_sha" "$correlation_id" "$claim_sha"
