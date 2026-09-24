import type { PathLike, Stats } from "node:fs";
import type { Pool } from "pg";

import type { Postgres18SocketTransport } from "./reader-summary-publication-postgres18-regression";

type RegressionModule = typeof import("./reader-summary-publication-postgres18-regression");

const directory = "/tmp/social-monitor-pg18-0123456789ab/socket";
const socket: Postgres18SocketTransport = {
  socketDirectory: directory,
  socketDevice: 31,
  socketInode: 47,
};
const database = "reader_summary_publication_test_00000000000000000000";
const socketUrl = `postgresql://fixture_user:social_monitor_local_password@127.0.0.1:5432/${database}?host=${encodeURIComponent(directory)}`;
const catalog = {
  rows: [{
    protected_membership_valid: true,
    membership_count: 1,
    server_version_num: "180001",
  }],
};
const query = jest.fn().mockResolvedValue(catalog);
const serverAdmin = { query } as unknown as Pool;
let regression: RegressionModule;
let docker: jest.Mock;
let lstat: jest.Mock;
let realpath: jest.Mock;
const stat = (kind: "directory" | "socket" | "symlink", uid: number, gid: number, mode: number): Stats =>
  ({
    uid,
    gid,
    mode,
    dev: 31,
    ino: 47,
    isDirectory: () => kind === "directory",
    isSocket: () => kind === "socket",
    isSymbolicLink: () => kind === "symlink",
  }) as Stats;

const run = (url: string, transport?: Postgres18SocketTransport) =>
  regression.assertPostgres18CreatorAndPsqlRegression({
    provisionerRole: "fixture_provisioner",
    runtimeRole: "fixture_runtime",
    serverAdmin,
    serverAdminDatabaseUrl: url,
    socketTransport: transport,
  });

const fixtureLstat = (path: PathLike): Stats => {
  if (path === "/tmp") return stat("directory", 0, 0, 0o41777);
  if (path === "/tmp/social-monitor-pg18-0123456789ab") {
    return stat("directory", process.getuid!(), process.getgid!(), 0o40700);
  }
  if (path === directory) return stat("directory", 999, 999, 0o40700);
  if (path === `${directory}/.s.PGSQL.5432`) {
    return stat("socket", 999, 999, 0o140777);
  }
  throw new Error("unexpected fixture path");
};

beforeEach(() => {
  jest.resetModules();
  delete process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT;
  query.mockClear().mockResolvedValue(catalog);
  docker = jest.fn(() => ({ status: 0, stderr: "" }));
  lstat = jest.fn(fixtureLstat);
  realpath = jest.fn((path: PathLike) => String(path));
  jest.doMock("node:child_process", () => ({
    ...jest.requireActual("node:child_process"), spawnSync: docker,
  }));
  jest.doMock("node:fs", () => ({
    ...jest.requireActual("node:fs"),
    lstatSync: lstat,
    realpathSync: Object.assign(jest.fn(), { native: realpath }),
  }));
  jest.isolateModules(() => {
    regression = require("./reader-summary-publication-postgres18-regression") as RegressionModule;
  });
});

afterEach(() => {
  delete process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT;
  jest.resetModules();
});

test("socket mode uses only the pinned cached image and exact private bind", async () => {
  await run(socketUrl, socket);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("pg_auth_members"), [
    "fixture_runtime", "fixture_provisioner",
  ]);
  const [command, args, options] = docker.mock.calls[0]!;
  expect(command).toBe("docker");
  expect(args).toEqual([
    "run", "--rm", "-i", "--user=0:0", "--network=none", "--pull=never",
    "--mount", `type=bind,source=${directory},target=/var/run/postgresql,readonly`,
    "postgres@sha256:86c951e05bf56c93d95d397747fb8820ac76cc3bedb78f43abd83eedbe3666ae",
    "sh", "-c", expect.any(String), "_", "/var/run/postgresql", "5432",
    database, "fixture_user", "fixture_runtime",
  ]);
  const script = args![args!.indexOf("-c") + 1]!;
  expect(script).toContain("--command=\"$query\"");
  expect(script).toContain("exit 90");
  expect(script).toContain("--file=\"$query_file\"");
  expect(script).toContain('[ "$result" = "$runtime_role" ]');
  expect(options?.input).toBe("*:5432:" + database + ":fixture_user:social_monitor_local_password\n");
});

test("explicit test environment configures the regression without a parameter", async () => {
  process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT = JSON.stringify(socket);
  await run(socketUrl.replace(database, "postgres"));
  expect(docker.mock.calls[0]![1]).toContain("--network=none");
  expect(docker.mock.calls[0]![1]).toContain("--pull=never");
});

test("malformed test environment fails before catalog or Docker", async () => {
  process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT = "{}";
  await expect(run(socketUrl)).rejects.toThrow("test socket transport configuration");
  expect(query).not.toHaveBeenCalled();
  expect(docker).not.toHaveBeenCalled();
});

test.each([
  ["non-PostgreSQL URL", socketUrl.replace("postgresql:", "http:")],
  ["remote host", socketUrl.replace("127.0.0.1", "db.example")],
  ["non-test database", socketUrl.replace(database, "other_database")],
  ["missing host override", socketUrl.split("?")[0]!],
  ["extra override", `${socketUrl}&sslmode=disable`],
  ["duplicate host", `${socketUrl}&host=${encodeURIComponent(directory)}`],
  ["URL fragment", `${socketUrl}#ignored`],
  ["wrong host override", socketUrl.replace(encodeURIComponent(directory), "%2Ftmp%2Fother")],
  ["short password", socketUrl.replace("social_monitor_local_password", "short")],
])("rejects %s before catalog or Docker", async (_label, url) => {
  await expect(run(url, socket)).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
  expect(docker).not.toHaveBeenCalled();
});

test("a host override without socket opt-in cannot silently use TCP", async () => {
  await expect(run(socketUrl)).rejects.toThrow("requires explicit test opt-in");
  expect(query).not.toHaveBeenCalled();
  expect(docker).not.toHaveBeenCalled();
});

test.each([
  ["broad mount", { ...socket, socketDirectory: "/var/run/postgresql" }],
  ["wrong inode", { ...socket, socketInode: 48 }],
  ["wrong device", { ...socket, socketDevice: 32 }],
])("rejects %s before catalog or Docker", async (_label, transport) => {
  const matchingUrl = socketUrl.replace(
    encodeURIComponent(directory), encodeURIComponent(transport.socketDirectory),
  );
  await expect(run(matchingUrl, transport)).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
  expect(docker).not.toHaveBeenCalled();
});

test.each([
  "symlink parent", "symlink leaf", "symlink socket",
  "loose parent", "wrong server owner", "loose leaf",
])(
  "rejects %s before catalog or Docker",
  async (failure) => {
    lstat.mockImplementation((path: PathLike) => {
      if (path === "/tmp/social-monitor-pg18-0123456789ab") {
        if (failure === "symlink parent") return stat("symlink", process.getuid!(), process.getgid!(), 0o40700);
        if (failure === "loose parent") return stat("directory", process.getuid!(), process.getgid!(), 0o40755);
      }
      if (path === directory) {
        if (failure === "symlink leaf") return stat("symlink", 999, 999, 0o40700);
        if (failure === "wrong server owner") return stat("directory", 1000, 1000, 0o40700);
        if (failure === "loose leaf") return stat("directory", 999, 999, 0o40755);
      }
      if (path === `${directory}/.s.PGSQL.5432` && failure === "symlink socket") {
        return stat("symlink", 999, 999, 0o140777);
      }
      return fixtureLstat(path);
    });
    await expect(run(socketUrl, socket)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    expect(docker).not.toHaveBeenCalled();
  },
);

test("rejects a resolved path that differs from the exact mounted directory", async () => {
  realpath.mockImplementation((path: PathLike) =>
    path === directory ? "/tmp/elsewhere/socket" : String(path));
  await expect(run(socketUrl, socket)).rejects.toThrow("socket fixture identity");
  expect(query).not.toHaveBeenCalled();
  expect(docker).not.toHaveBeenCalled();
});

test("catalog failure never runs Docker; psql failure never reports a fixture password", async () => {
  query.mockResolvedValueOnce({ rows: [{ ...catalog.rows[0], protected_membership_valid: false }] });
  await expect(run(socketUrl, socket)).rejects.toThrow("protected creator membership");
  expect(docker).not.toHaveBeenCalled();
  docker.mockReturnValueOnce({ status: 1, stderr: "social_monitor_local_password" });
  await expect(run(socketUrl, socket)).rejects.toThrow(/^real psql catalog-variable regression failed$/);
});

test("default TCP Docker argv and image remain unchanged", async () => {
  await run("postgresql://fixture_user:social_monitor_local_password@127.0.0.1:5432/postgres");
  const [command, args, options] = docker.mock.calls[0]!;
  expect(command).toBe("docker");
  expect(args).toEqual([
    "run", "--rm", "-i", "--user=0:0", "--network=host",
    "postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15",
    "sh", "-c", expect.any(String), "_", "127.0.0.1", "5432", "postgres",
    "fixture_user", "fixture_runtime",
  ]);
  expect(options?.input).toBe("127.0.0.1:5432:postgres:fixture_user:social_monitor_local_password\n");
});
