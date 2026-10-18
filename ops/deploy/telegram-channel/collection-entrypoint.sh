#!/bin/sh
# Only the native finite operator may open this existing database role.
set -eu
test "$#" -eq 1 && test "$1" = --collect || exit 64
test "${SOCIAL_MONITOR_RUNTIME_PROFILE:-}" = beta || exit 78
password_file=/run/secrets/postgres-collection-password
test -f "$password_file" && test ! -L "$password_file" || exit 78
test "$(stat -c '%u:%g:%a:%h' "$password_file")" = 0:0:400:1 || exit 78
IFS= read -r db_password < "$password_file"
case "$db_password" in *[!0-9a-f]*|'') exit 78 ;; esac
test "${#db_password}" -eq 64 || exit 78
test -f /run/postgres-ca.crt && test ! -L /run/postgres-ca.crt || exit 78
install -m 0644 /run/postgres-ca.crt /tmp/postgres-ca.crt
export NODE_EXTRA_CA_CERTS=/tmp/postgres-ca.crt
export DATABASE_URL="postgresql://social_monitor_collection_v2:$db_password@host.docker.internal:5432/social_monitor?sslmode=verify-full&sslrootcert=/tmp/postgres-ca.crt"
unset db_password password_file
exec setpriv --reuid=node --regid=node --init-groups --no-new-privs \
  node scripts/run-with-timeout.mjs --timeout-ms 180000 --node-options --max-old-space-size=512 -- \
  ts-node -r tsconfig-paths/register scripts/run-telegram-channel-collection.ts --collect
