import { accessSync, constants, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isIP } from "node:net";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

export type StrictGrpcAdmission = {
  readonly workspaceRoot: string;
};

const safePoolId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const pathWithin = (root: string, candidate: string): boolean => {
  const child = relative(root, candidate);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
};

const pathsOverlap = (left: string, right: string): boolean =>
  pathWithin(left, right) || pathWithin(right, left);

const explicitPath = (value: string | undefined, label: string): string => {
  if (value === undefined || value.trim() === "" || value !== value.trim() || !isAbsolute(value)) {
    throw new Error(`${label} must be an explicit absolute path`);
  }
  if (value.split(sep).some((part) => part === "." || part === "..")) {
    throw new Error(`${label} must not contain path traversal`);
  }
  return value;
};

const noSymlinkComponents = (path: string, label: string): void => {
  let current = parse(path).root;
  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} must not contain a symlink`);
    }
  }
  if (realpathSync(path) !== path) {
    throw new Error(`${label} must resolve without aliases`);
  }
};

const directory = (value: string | undefined, label: string): string => {
  const path = explicitPath(value, label);
  if (path === parse(path).root) throw new Error(`${label} must not be the filesystem root`);
  noSymlinkComponents(path, label);
  if (!statSync(path).isDirectory()) throw new Error(`${label} must be a directory`);
  return path;
};

const file = (value: string | undefined, label: string): string => {
  const path = explicitPath(value, label);
  noSymlinkComponents(path, label);
  if (!statSync(path).isFile()) throw new Error(`${label} must be a regular file`);
  return path;
};

const immutablePoolPath = (root: string, path: string): void => {
  let candidate = root;
  for (const part of ["", ...relative(root, path).split(sep)]) {
    if (part !== "") candidate = join(candidate, part);
    if ((statSync(candidate).mode & 0o022) !== 0) {
      throw new Error("Codex auth pool paths must not be group- or world-writable");
    }
  }
};

const bindAddress = (value: string | undefined): void => {
  if (value === undefined || value.trim() !== value) {
    throw new Error("AGENT_RUNTIME_GRPC_BIND must be explicit");
  }
  const match = /^(?:\[([0-9a-fA-F:.]+)\]|([0-9.]+)):([0-9]{1,5})$/.exec(value);
  if (match === null) throw new Error("AGENT_RUNTIME_GRPC_BIND must use a numeric IP and port");
  const ip = match[1] ?? match[2] ?? "";
  const port = Number(match[3]);
  if (port < 1 || port > 65535 || isIP(ip) === 0 || ip === "0.0.0.0" || ip === "::") {
    throw new Error("AGENT_RUNTIME_GRPC_BIND must use a private or loopback IP and valid port");
  }
  if (isIP(ip) === 4) {
    const octets = ip.split(".");
    const a = Number(octets[0]);
    const b = Number(octets[1]);
    if (!(a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) {
      throw new Error("AGENT_RUNTIME_GRPC_BIND must use a private or loopback IP");
    }
  } else {
    const firstHextet = Number.parseInt(ip.split(":")[0] ?? "", 16);
    if (ip !== "::1" && !(firstHextet >= 0xfc00 && firstHextet <= 0xfdff)) {
      throw new Error("AGENT_RUNTIME_GRPC_BIND must use a private or loopback IP");
    }
  }
};

export const resolveStrictGrpcAdmission = (env: NodeJS.ProcessEnv): StrictGrpcAdmission | undefined => {
  const mode = env.AGENT_RUNTIME_STRICT_PRODUCTION_ADMISSION;
  if (mode === undefined || mode === "" || mode === "0" || mode === "false") return undefined;
  if (mode !== "1" && mode !== "true") throw new Error("AGENT_RUNTIME_STRICT_PRODUCTION_ADMISSION must be 1 or true");
  if (!env.AGENT_RUNTIME_SERVICE_TOKEN?.trim()) throw new Error("AGENT_RUNTIME_SERVICE_TOKEN is required in strict mode");
  bindAddress(env.AGENT_RUNTIME_GRPC_BIND);
  const workspaceRoot = directory(env.AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT, "AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT");
  const stateRoot = directory(env.AGENT_RUNTIME_STATE_ROOT, "AGENT_RUNTIME_STATE_ROOT");
  if (env.AGENT_RUNTIME_EPHEMERAL === "1" || env.AGENT_RUNTIME_EPHEMERAL?.toLowerCase() === "true") {
    throw new Error("AGENT_RUNTIME_EPHEMERAL must be disabled in strict mode");
  }
  const poolRoot = directory(env.AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT, "AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT");
  if (pathsOverlap(workspaceRoot, stateRoot) || pathsOverlap(workspaceRoot, poolRoot) || pathsOverlap(stateRoot, poolRoot)) {
    throw new Error("Strict workspace, state, and Codex pool roots must be separate");
  }
  const manifest = file(env.AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST, "AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST");
  if (!pathWithin(poolRoot, manifest) || manifest === poolRoot) {
    throw new Error("AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST must be inside the pool root");
  }
  immutablePoolPath(poolRoot, manifest);
  if (statSync(manifest).size < 1 || statSync(manifest).size > 64 * 1024) {
    throw new Error("AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST has an invalid size");
  }
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !== "accounts,schemaVersion,snapshotId" ||
      !Array.isArray((parsed as { accounts?: unknown }).accounts) ||
      (parsed as { accounts: unknown[] }).accounts.length === 0 ||
      (parsed as { accounts: unknown[] }).accounts.length > 16 ||
      (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
      typeof (parsed as { snapshotId?: unknown }).snapshotId !== "string" ||
      !safePoolId.test((parsed as { snapshotId: string }).snapshotId)) {
    throw new Error("AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST must name a versioned account pool");
  }
  const accountIds = new Set<string>();
  const accountPaths = new Set<string>();
  for (const account of (parsed as { accounts: unknown[] }).accounts) {
    if (account === null || typeof account !== "object" || Array.isArray(account) ||
        Object.keys(account).sort().join(",") !== "id,relativePath" ||
        typeof (account as { relativePath?: unknown }).relativePath !== "string" ||
        typeof (account as { id?: unknown }).id !== "string" ||
        !safePoolId.test((account as { id: string }).id)) {
      throw new Error("Codex auth pool account reference is invalid");
    }
    const relativePath = (account as { relativePath: string }).relativePath;
    if (relativePath === "" || relativePath.trim() !== relativePath || isAbsolute(relativePath) ||
        relativePath.includes("\\") || relativePath.split("/").some((part) => part === "" || part === "." || part === "..") ||
        accountIds.has((account as { id: string }).id) || accountPaths.has(relativePath)) {
      throw new Error("Codex auth pool account path is invalid");
    }
    accountIds.add((account as { id: string }).id);
    accountPaths.add(relativePath);
    const accountPath = join(poolRoot, relativePath);
    if (!pathWithin(poolRoot, accountPath)) throw new Error("Codex auth pool account escapes the pool root");
    file(accountPath, "Codex auth pool account reference");
    immutablePoolPath(poolRoot, accountPath);
    if (statSync(accountPath).size < 1 || statSync(accountPath).size > 1024 * 1024) {
      throw new Error("Codex auth pool account reference has an invalid size");
    }
  }
  if (env.AGENT_RUNTIME_CODEX_AUTH_JSON_PATH?.trim() || env.CODEX_AUTH_JSON_PATH?.trim()) {
    throw new Error("Strict mode requires the Codex pool, not a single auth path");
  }
  const cliPath = file(env.AGENT_RUNTIME_CLI_PATH, "AGENT_RUNTIME_CLI_PATH");
  if (pathWithin(workspaceRoot, cliPath) || pathWithin(stateRoot, cliPath)) {
    throw new Error("AGENT_RUNTIME_CLI_PATH must be outside the workspace and state roots");
  }
  accessSync(cliPath, constants.X_OK);
  return { workspaceRoot };
};

const mountPoints = (): readonly string[] => {
  const entries = readFileSync("/proc/self/mountinfo", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" ")[4]?.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8))))
    .filter((path): path is string => path !== undefined);
  if (!entries.includes("/")) throw new Error("Mount table is unavailable for strict cwd admission");
  return entries;
};

export const admitStrictCwd = (
  cwd: string | undefined,
  admission: StrictGrpcAdmission,
  mountedPaths: () => readonly string[] = mountPoints,
): string => {
  const path = explicitPath(cwd, "Agent runtime cwd");
  if (!pathWithin(admission.workspaceRoot, path)) throw new Error("Agent runtime cwd is outside the trusted project workspace");
  noSymlinkComponents(path, "Agent runtime cwd");
  if (!statSync(path).isDirectory()) throw new Error("Agent runtime cwd must be a directory");
  if (statSync(path).dev !== statSync(admission.workspaceRoot).dev ||
      mountedPaths().some((mount) => mount !== admission.workspaceRoot && pathWithin(admission.workspaceRoot, mount) && pathWithin(mount, path))) {
    throw new Error("Agent runtime cwd crosses a foreign mount");
  }
  return path;
};
