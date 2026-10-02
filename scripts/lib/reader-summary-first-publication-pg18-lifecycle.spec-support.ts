import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { closeSync, constants, openSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type State = "namespace-created" | "initialized" | "start-requested" | "owned-postmaster" | "uncertain" | "verified-stopped";
type Identity = Readonly<{ pid: number; uid: number; executable: string; startTicks: string; data: string; startedAt: number }>;

/** Private native FIRSTPUB fixture only. Stop may be verified, but the entire
 * namespace is always retained, never automatically cleaned. Uncertainty is
 * terminal for automatic lifecycle work; this fixture grants no cleanup authority. */
export function createFirstpubPg18Lifecycle(bin: string) {
  if (typeof process.getuid !== "function" || typeof process.geteuid !== "function" ||
      process.getuid() === 0 || process.geteuid() === 0 || process.getuid() !== process.geteuid()) {
    throw new Error("FIRSTPUB native fixture requires an admitted nonroot identity before namespace creation");
  }
  const uid = process.geteuid();
  const expectedExecutable = realpathSync(join(bin, "postgres"));
  const cwd = realpathSync(process.cwd());
  const root = mkdtempSync(join(cwd, ".firstpub-native-pg18-"));
  const initial = lstatSync(root);
  const data = join(root, "data"), socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const host = `/proc/${process.pid}/cwd/${basename(root)}/socket`;
  const children = new Map<string, { dev: number; ino: number }>();
  children.set(socket, lstatSync(socket));
  let state: State = "namespace-created";
  const isUncertain = () => state === "uncertain";
  let owned: Identity | undefined;
  let startRequestedAt: number | undefined;
  const evidence: unknown[] = [];
  const record = (entry: object) => {
    const current = lstatSync(root);
    if (!current.isDirectory() || current.isSymbolicLink() || current.uid !== uid ||
        current.dev !== initial.dev || current.ino !== initial.ino) {
      throw new Error("Owned evidence namespace identity changed; no evidence write attempted");
    }
    evidence.push({ state, ...entry });
    const fd = openSync(join(root, "lifecycle.json"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    let writeFailed = false;
    let writeFailure: unknown;
    try { writeFileSync(fd, JSON.stringify(evidence, null, 2) + "\n"); }
    catch (error) { writeFailed = true; writeFailure = error; }
    try { closeSync(fd); }
    catch (closeFailure) {
      if (writeFailed) throw new AggregateError([writeFailure, closeFailure], "Owned lifecycle evidence write and close failed; namespace retained");
      throw closeFailure;
    }
    if (writeFailed) throw writeFailure;
  };
  const uncertain = (reason: string): never => {
    state = "uncertain"; record({ reason });
    throw new Error(`Own PG18 lifecycle uncertain (${reason}); namespace retained: ${root}`);
  };
  const absent = (path: string) => {
    try { lstatSync(path); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; }
  };
  const validateNamespace = () => {
    const current = lstatSync(root);
    if (dirname(root) !== cwd || !/^\.firstpub-native-pg18-[A-Za-z0-9]+$/u.test(basename(root)) ||
        !current.isDirectory() || current.isSymbolicLink() || current.uid !== uid ||
        current.dev !== initial.dev || current.ino !== initial.ino || realpathSync(root) !== root ||
        (current.mode & 0o077) !== 0) throw new Error("Owned namespace identity changed");
    for (const path of [data, socket]) {
      if (absent(path)) continue;
      const entry = lstatSync(path);
      const pinned = children.get(path);
      if (pinned && (entry.dev !== pinned.dev || entry.ino !== pinned.ino)) throw new Error("Owned child inode changed");
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.uid !== uid || realpathSync(path) !== path) {
        throw new Error("Owned namespace child identity changed");
      }
    }
  };
  const command = (name: "postgres" | "initdb" | "pg_ctl", action: string, args: string[]) => {
    let result: SpawnSyncReturns<string>;
    try { result = spawnSync(join(bin, name), args, { encoding: "utf8", timeout: 30_000 }); }
    catch {
      record({ command: name, action, exit: null, signal: null, spawnError: "THROWN" });
      throw new Error("Native lifecycle command could not be observed");
    }
    const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
    // Record bounded metadata only: no command output, error text or connection.
    record({ command: name, action, exit: result.status, signal: result.signal,
      spawnError: errorCode && /^[A-Z0-9_]+$/u.test(errorCode) ? errorCode : result.error ? "UNKNOWN" : null });
    return result;
  };
  const succeeded = (r: ReturnType<typeof command>) => r.status === 0 && !r.signal && !r.error;
  const identity = (): Identity => {
    validateNamespace();
    const lines = readFileSync(join(data, "postmaster.pid"), "utf8").split("\n");
    if (!/^[1-9]\d*$/u.test(lines[0] ?? "")) {
      record({ pidObservation: "empty-or-invalid" });
      throw new Error("PID observation empty or invalid");
    }
    const pid = Number(lines[0]);
    const startedAt = Number(lines[2]);
    record({ pidObservation: { pid, dataMatches: lines[1] === data,
      socketMatches: lines[4] === host, ready: lines[7] === "ready", startedAt } });
    if (!Number.isSafeInteger(pid) || pid === process.pid || lines[1] !== data ||
        !/^[1-9]\d*$/u.test(lines[2] ?? "") || lines[3] !== "5432" ||
        lines[4] !== host || lines[7] !== "ready" || startRequestedAt === undefined ||
        startedAt < startRequestedAt || startedAt > Math.floor(Date.now() / 1000)) throw new Error("Postmaster namespace identity mismatch");
    const proc = `/proc/${pid}`;
    const procUid = statSync(proc).uid;
    const executable = realpathSync(`${proc}/exe`);
    const argv = readFileSync(`${proc}/cmdline`, "utf8").split("\0");
    const d = argv.indexOf("-D");
    const fields = readFileSync(`${proc}/stat`, "utf8").split(") ").at(-1)!.trim().split(/\s+/u);
    const startTicks = fields[19];
    record({ processObservation: { pid, uid: procUid, startTicks,
      executableMatches: executable === expectedExecutable, dataMatches: d >= 0 && resolve(argv[d + 1] ?? "") === data } });
    if (procUid !== uid || executable !== expectedExecutable || d < 0 ||
        resolve(argv[d + 1] ?? "") !== data || !startTicks || !/^\d+$/u.test(startTicks)) {
      throw new Error("Postmaster process identity mismatch");
    }
    return { pid, uid: procUid, executable, startTicks, data, startedAt };
  };
  const confirm = () => {
    const before = identity();
    const status = command("pg_ctl", "status", ["-D", data, "status"]);
    const statusPid = Number(/server is running \(PID: ([1-9]\d*)\)/u.exec(status.stdout)?.[1]);
    record({ statusObservation: { pid: Number.isSafeInteger(statusPid) ? statusPid : null } });
    const after = identity();
    if (!succeeded(status) || statusPid !== before.pid || JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("Postmaster status/identity observation uncertain");
    }
    record({ identity: after }); return after;
  };
  const initializeAndStart = () => {
    if (state !== "namespace-created") return uncertain("initialization already attempted");
    try {
      validateNamespace();
      const version = command("postgres", "version", ["--version"]);
      if (!succeeded(version) || !/PostgreSQL\) 18\./u.test(version.stdout)) throw new Error("Native PostgreSQL 18 is required");
      const init = command("initdb", "initialize", ["-D", data, "-U", "firstpub_synthetic_super", "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8"]);
      if (!succeeded(init)) return uncertain("initialization observation failed");
      children.set(data, lstatSync(data));
      state = "initialized"; record({});
      writeFileSync(join(data, "postgresql.auto.conf"), `listen_addresses = ''\nunix_socket_directories = '${host}'\nunix_socket_permissions = 0700\nlog_min_error_statement = 'panic'\n`);
      startRequestedAt = Math.floor(Date.now() / 1000);
      state = "start-requested"; record({});
      const start = command("pg_ctl", "start", ["-D", data, "-l", join(root, "server.log"), "-w", "start"]);
      if (!succeeded(start)) return uncertain("startup observation failed");
      owned = confirm(); state = "owned-postmaster"; record({});
    } catch (error) {
      if (isUncertain()) throw error;
      state = "uncertain";
      const code = (error as NodeJS.ErrnoException).code;
      record({ identityObservation: "failed", observationError: code && /^[A-Z0-9_]+$/u.test(code) ? code : "UNKNOWN" });
      return uncertain("startup identity observation failed");
    }
  };
  const stop = () => {
    if (state === "verified-stopped") return;
    if (state !== "owned-postmaster" || !owned) return uncertain("no confirmed owned postmaster for shutdown");
    try {
      const current = confirm();
      if (JSON.stringify(current) !== JSON.stringify(owned)) return uncertain("owned postmaster changed");
      const stopped = command("pg_ctl", "stop", ["-D", data, "-m", "fast", "-w", "stop"]);
      if (!succeeded(stopped)) return uncertain("stop observation failed");
      const status = command("pg_ctl", "status", ["-D", data, "status"]);
      if (status.status !== 3 || status.signal || status.error || !absent(join(data, "postmaster.pid")) ||
          !absent(`/proc/${owned.pid}`)) return uncertain("shutdown not verified");
      validateNamespace(); state = "verified-stopped"; record({ identity: owned, namespace: "retained" });
      // This verifies the owned stop observation, not a continuing liveness
      // lease. A same-UID restart can follow it: retain data/socket and evidence.
    } catch (error) {
      if (isUncertain()) throw error;
      state = "uncertain";
      const code = (error as NodeJS.ErrnoException).code;
      record({ identityObservation: "failed", observationError: code && /^[A-Z0-9_]+$/u.test(code) ? code : "UNKNOWN" });
      return uncertain("shutdown identity observation failed");
    }
  };
  return { root, host, initializeAndStart, stop, isOwned: () => state === "owned-postmaster" };
}
