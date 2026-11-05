import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { Pool } from "pg";

const postgresClientImage =
  "postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
const socketClientImage =
  "postgres@sha256:86c951e05bf56c93d95d397747fb8820ac76cc3bedb78f43abd83eedbe3666ae";

// The pinned official PostgreSQL server image runs postgres as uid/gid 999.
// The orchestrator records the socket inode after that server starts. Neither
// identity nor the socket source is selectable by untrusted fixture input.
export type Postgres18SocketTransport = Readonly<{
  socketDirectory: string;
  socketDevice: number;
  socketInode: number;
}>;

const socketTransportFromTestEnvironment = (
): Postgres18SocketTransport | undefined => {
  const value = process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT;
  if (value === undefined) return undefined;
  try {
    const candidate: unknown = JSON.parse(value);
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      Object.keys(candidate).sort().join(",") !==
        "socketDevice,socketDirectory,socketInode"
    ) throw new Error();
    const input = candidate as Record<string, unknown>;
    if (
      typeof input.socketDirectory !== "string" ||
      typeof input.socketDevice !== "number" ||
      typeof input.socketInode !== "number"
    ) throw new Error();
    return {
      socketDirectory: input.socketDirectory,
      socketDevice: input.socketDevice,
      socketInode: input.socketInode,
    };
  } catch {
    throw new Error("PostgreSQL 18 test socket transport configuration is invalid");
  }
};

export const assertPostgres18PsqlTransportConfiguration = (
  serverAdminDatabaseUrl: string,
  runtimeRole: string,
): void => {
  preparePsqlTransport(
    serverAdminDatabaseUrl,
    runtimeRole,
    socketTransportFromTestEnvironment(),
  );
};

export const assertPostgres18CreatorAndPsqlRegression = async (params: {
  readonly provisionerRole: string;
  readonly runtimeRole: string;
  readonly serverAdmin: Pool;
  readonly serverAdminDatabaseUrl: string;
  readonly socketTransport?: Postgres18SocketTransport;
}): Promise<void> => {
  // Existing fixture bootstrap calls this before the optional publication
  // callback. The explicit test-only env bridge keeps that call on the socket.
  const socketTransport =
    params.socketTransport ?? socketTransportFromTestEnvironment();
  const transport = preparePsqlTransport(
    params.serverAdminDatabaseUrl,
    params.runtimeRole,
    socketTransport,
  );
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

  assertPsqlFileInterpolation(transport, params.runtimeRole);
};

type PsqlTransport = Readonly<{
  database: string;
  username: string;
  password: string;
  port: string;
  psqlHost: string;
  pgpassHost: string;
  dockerArguments: readonly string[];
  image: string;
  socketMode: boolean;
}>;

const preparePsqlTransport = (
  connectionString: string,
  runtimeRole: string,
  socketTransport?: Postgres18SocketTransport,
): PsqlTransport => {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("PostgreSQL 18 psql regression requires a local test URL");
  }
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
    !/^[a-z][a-z0-9_]+$/.test(runtimeRole)
  ) {
    throw new Error("PostgreSQL 18 psql regression requires a local test URL");
  }
  if (socketTransport) {
    const overrides = [...databaseUrl.searchParams.entries()];
    if (
      overrides.length !== 1 ||
      overrides[0]?.[0] !== "host" ||
      overrides[0][1] !== socketTransport.socketDirectory ||
      databaseUrl.hash !== "" ||
      // Bootstrap connects to postgres before the bounded fixture DB exists.
      !(database === "postgres" ||
        /^reader_summary_publication_test_[0-9a-f]{20}$/.test(database)) ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(username) ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(password) ||
      !/^[1-9][0-9]{0,4}$/.test(port) ||
      Number(port) > 65535
    ) {
      throw new Error("PostgreSQL 18 socket fixture URL is invalid");
    }
    assertPrivatePostgresSocket(socketTransport, port);
    return {
      database,
      username,
      password,
      port,
      psqlHost: "/var/run/postgresql",
      pgpassHost: "*",
      dockerArguments: [
        "--network=none",
        "--pull=never",
        "--mount",
        `type=bind,source=${socketTransport.socketDirectory},target=/var/run/postgresql,readonly`,
      ],
      image: socketClientImage,
      socketMode: true,
    };
  }
  if (databaseUrl.searchParams.has("host")) {
    throw new Error("PostgreSQL 18 socket transport requires explicit test opt-in");
  }
  const dockerDesktop = process.platform !== "linux";
  const psqlHost = dockerDesktop ? "host.docker.internal" : host;
  return {
    database,
    username,
    password,
    port,
    psqlHost,
    pgpassHost: psqlHost,
    dockerArguments: dockerDesktop ? [] : ["--network=host"],
    image: postgresClientImage,
    socketMode: false,
  };
};

const assertPrivatePostgresSocket = (
  transport: Postgres18SocketTransport,
  port: string,
): void => {
  const directory = transport.socketDirectory;
  const parent = dirname(directory);
  const socketFile = `${directory}/.s.PGSQL.${port}`;
  const expectedOwner = process.getuid?.();
  try {
    if (
      !isAbsolute(directory) ||
      resolve(directory) !== directory ||
      dirname(parent) !== "/tmp" ||
      !/^social-monitor-pg18-[0-9a-f]{12,32}$/.test(basename(parent)) ||
      basename(directory) !== "socket" ||
      expectedOwner === undefined ||
      !Number.isSafeInteger(transport.socketDevice) ||
      !Number.isSafeInteger(transport.socketInode) ||
      transport.socketDevice <= 0 ||
      transport.socketInode <= 0 ||
      !lstatSync("/tmp").isDirectory() ||
      realpathSync.native(parent) !== parent ||
      realpathSync.native(directory) !== directory
    ) {
      throw new Error();
    }
    const parentStat = lstatSync(parent);
    const directoryStat = lstatSync(directory);
    const socketStat = lstatSync(socketFile);
    if (
      !parentStat.isDirectory() || parentStat.isSymbolicLink() ||
      parentStat.uid !== expectedOwner ||
      (parentStat.mode & 0o7777) !== 0o700 ||
      !directoryStat.isDirectory() || directoryStat.isSymbolicLink() ||
      directoryStat.uid !== 999 || directoryStat.gid !== 999 ||
      (directoryStat.mode & 0o7777) !== 0o700 ||
      !socketStat.isSocket() || socketStat.isSymbolicLink() ||
      socketStat.uid !== 999 || socketStat.gid !== 999 ||
      socketStat.dev !== transport.socketDevice ||
      socketStat.ino !== transport.socketInode
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("PostgreSQL 18 socket fixture identity is invalid");
  }
};

const assertPsqlFileInterpolation = (
  transport: PsqlTransport,
  runtimeRole: string,
): void => {
  const pgpass = [
    transport.pgpassHost,
    transport.port,
    transport.database,
    transport.username,
    transport.password,
  ]
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
      ...transport.dockerArguments,
      transport.image,
      "sh",
      "-c",
      script,
      "_",
      transport.psqlHost,
      transport.port,
      transport.database,
      transport.username,
      runtimeRole,
    ],
    { encoding: "utf8", input: `${pgpass}\n` },
  );
  if (result.status !== 0) {
    const diagnostic = transport.socketMode
      ? ""
      : result.stderr.trim().slice(0, 500);
    throw new Error(
      `real psql catalog-variable regression failed${diagnostic ? `: ${diagnostic}` : ""}`,
    );
  }
};

const pgpassEscape = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
