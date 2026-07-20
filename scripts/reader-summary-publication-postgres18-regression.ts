import { spawnSync } from "node:child_process";

import type { Pool } from "pg";

const postgresClientImage =
  "postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";

export const assertPostgres18CreatorAndPsqlRegression = async (params: {
  readonly provisionerRole: string;
  readonly runtimeRole: string;
  readonly serverAdmin: Pool;
  readonly serverAdminDatabaseUrl: string;
}): Promise<void> => {
  const catalog = await params.serverAdmin.query<{
    readonly protected_membership_valid: boolean;
    readonly membership_count: number;
    readonly server_version_num: string;
  }>(
    `SELECT current_setting('server_version_num') AS server_version_num,
            count(*)::integer AS membership_count,
            COALESCE(bool_and(
              member_role.rolname = $2
              AND member_role.rolcreaterole
              AND NOT member_role.rolsuper
              AND grantor_role.rolsuper
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
            ), false) AS protected_membership_valid
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS granted_role
         ON granted_role.oid = membership.roleid
       JOIN pg_catalog.pg_roles AS member_role
         ON member_role.oid = membership.member
       JOIN pg_catalog.pg_roles AS grantor_role
         ON grantor_role.oid = membership.grantor
      WHERE granted_role.rolname = $1`,
    [params.runtimeRole, params.provisionerRole],
  );
  const [row] = catalog.rows;
  if (
    !row ||
    !/^18[0-9]{4}$/.test(row.server_version_num) ||
    row.membership_count !== 1 ||
    !row.protected_membership_valid
  ) {
    throw new Error(
      "PostgreSQL 18 did not create the exact protected creator membership",
    );
  }

  assertPsqlFileInterpolation({
    databaseUrl: params.serverAdminDatabaseUrl,
    runtimeRole: params.runtimeRole,
  });
};

const assertPsqlFileInterpolation = (params: {
  readonly databaseUrl: string;
  readonly runtimeRole: string;
}): void => {
  const databaseUrl = new URL(params.databaseUrl);
  const host = databaseUrl.hostname;
  const port = databaseUrl.port || "5432";
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  const username = decodeURIComponent(databaseUrl.username);
  const password = decodeURIComponent(databaseUrl.password);
  if (
    databaseUrl.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost"].includes(host) ||
    !/^[0-9]{1,5}$/.test(port) ||
    !database ||
    !username ||
    !password ||
    !/^[a-z][a-z0-9_]+$/.test(params.runtimeRole)
  ) {
    throw new Error("PostgreSQL 18 psql regression requires a local test URL");
  }
  const pgpass = [host, port, database, username, password]
    .map(pgpassEscape)
    .join(":");
  const script = String.raw`
set -eu
host=$1
port=$2
database=$3
username=$4
runtime_role=$5
pgpass_file=
query_file=
cleanup() {
  if [ -n "$pgpass_file" ]; then rm -f -- "$pgpass_file"; fi
  if [ -n "$query_file" ]; then rm -f -- "$query_file"; fi
}
trap cleanup EXIT
trap "exit 129" HUP
trap "exit 130" INT
trap "exit 143" TERM
umask 077
pgpass_file=$(mktemp /tmp/social-monitor-pg18-pgpass.XXXXXX)
cat > "$pgpass_file"
chmod 0600 "$pgpass_file"
[ -s "$pgpass_file" ]
PGPASSFILE=$pgpass_file
PGCONNECT_TIMEOUT=15
export PGPASSFILE PGCONNECT_TIMEOUT
query="SELECT :'runtime_role'::text;"
if psql -X -A -t --no-password -v ON_ERROR_STOP=1 \
  --host="$host" --port="$port" --dbname="$database" \
  --username="$username" --set=runtime_role="$runtime_role" \
  --command="$query" >/dev/null 2>&1; then
  exit 90
fi
query_file=$(mktemp /tmp/social-monitor-pg18-query.XXXXXX)
printf "%s\n" "$query" > "$query_file"
chmod 0600 "$query_file"
[ "$(stat -c %a "$query_file")" = 600 ]
result=$(psql -X -A -t --no-password -v ON_ERROR_STOP=1 \
  --host="$host" --port="$port" --dbname="$database" \
  --username="$username" --set=runtime_role="$runtime_role" \
  --file="$query_file")
[ "$result" = "$runtime_role" ]
`;
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      "--user=0:0",
      "--network=host",
      postgresClientImage,
      "sh",
      "-c",
      script,
      "_",
      host,
      port,
      database,
      username,
      params.runtimeRole,
    ],
    { encoding: "utf8", input: `${pgpass}\n` },
  );
  if (result.status !== 0) {
    throw new Error("real psql catalog-variable regression failed");
  }
};

const pgpassEscape = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
