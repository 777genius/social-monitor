import { accessSync, constants, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isIP } from "node:net";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { isMimoOnly, resolveAllowedModelBackends, type AllowedModelBackend } from "./backend-admission-policy";

export type StrictGrpcAdmission = {
  readonly workspaceRoot: string;
  readonly allowedModelBackends: readonly AllowedModelBackend[];
  readonly allowedScope?: { readonly tenantId: string; readonly workspaceId: string };
};

const safePoolId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const safeScopeId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?![\s\S])/;
const resolveAllowedScope = (
  env: NodeJS.ProcessEnv,
  required: boolean,
): StrictGrpcAdmission["allowedScope"] => {
  const tenantId = env.AGENT_RUNTIME_ALLOWED_TENANT_ID;
  const workspaceId = env.AGENT_RUNTIME_ALLOWED_WORKSPACE_ID;
  if (tenantId === undefined && workspaceId === undefined && !required) return undefined;
  if (typeof tenantId !== "string" || !safeScopeId.test(tenantId) ||
      typeof workspaceId !== "string" || !safeScopeId.test(workspaceId)) {
    throw new Error("Strict gRPC admission requires a valid paired tenant and workspace scope");
  }
  return { tenantId, workspaceId };
};
export const admitsStrictScope = (
  tenantId: string,
  workspaceId: string,
  admission: StrictGrpcAdmission,
): boolean => {
  const scope = admission.allowedScope;
  if (scope === undefined) return !isMimoOnly(admission.allowedModelBackends);
  return typeof tenantId === "string" && safeScopeId.test(tenantId) &&
    typeof workspaceId === "string" && safeScopeId.test(workspaceId) &&
    typeof scope.tenantId === "string" && safeScopeId.test(scope.tenantId) &&
    typeof scope.workspaceId === "string" && safeScopeId.test(scope.workspaceId) &&
    tenantId === scope.tenantId && workspaceId === scope.workspaceId;
};
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

const systemdMimoKeyPath = /^\/run\/credentials\/[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}\.service\/mimo_key$/;
const requireServiceUnwritable = (path: string, message: string): void => {
  try {
    accessSync(path, constants.W_OK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EACCES") return;
  }
  throw new Error(message);
};

const mimoKeyFile = (value: string | undefined, workspaceRoot: string, stateRoot: string): void => {
  const label = "AGENT_RUNTIME_MIMO_API_KEY_FILE";
  const keyPath = file(value, label);
  if (pathWithin(workspaceRoot, keyPath) || pathWithin(stateRoot, keyPath)) {
    throw new Error(`${label} must be outside workspace and state roots`);
  }
  const metadata = statSync(keyPath);
  const systemdCopy = systemdMimoKeyPath.test(keyPath);
  const ownerOnly = (metadata.mode & 0o400) !== 0 && (metadata.mode & 0o077) === 0;
  const systemdReadable = systemdCopy && metadata.uid === 0 && metadata.gid === 0 &&
    (metadata.mode & 0o7777) === 0o440;
  if (metadata.size < 1 || metadata.size > 4096 ||
      (!ownerOnly && !systemdReadable) || metadata.nlink !== 1) {
    throw new Error(`${label} must be a bounded owner-only regular file`);
  }
  let parent = parse(keyPath).root;
  if (systemdReadable) {
    const rootMetadata = statSync(parent);
    if (!rootMetadata.isDirectory() || rootMetadata.uid !== 0 || rootMetadata.gid !== 0 ||
        (rootMetadata.mode & 0o022) !== 0) {
      throw new Error(`${label} requires immutable trusted parent directories`);
    }
    requireServiceUnwritable(parent, `${label} requires immutable trusted parent directories`);
  }
  for (const part of keyPath.slice(parent.length).split(sep).filter(Boolean).slice(0, -1)) {
    parent = join(parent, part);
    const directoryMetadata = statSync(parent);
    if (!directoryMetadata.isDirectory() || (directoryMetadata.mode & 0o022) !== 0 ||
        (systemdReadable && (directoryMetadata.uid !== 0 || directoryMetadata.gid !== 0))) {
      throw new Error(`${label} requires immutable trusted parent directories`);
    }
    if (systemdReadable) requireServiceUnwritable(parent, `${label} requires immutable trusted parent directories`);
  }
  if (systemdReadable) {
    try {
      accessSync(keyPath, constants.R_OK);
      requireServiceUnwritable(keyPath, `${label} must be readable and not writable by the service`);
      return;
    } catch {
      throw new Error(`${label} must be readable and not writable by the service`);
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
  const allowedModelBackends = resolveAllowedModelBackends(env.AGENT_RUNTIME_ALLOWED_MODEL_BACKENDS);
  const allowedScope = resolveAllowedScope(env, isMimoOnly(allowedModelBackends));
  if (env.AGENT_RUNTIME_EPHEMERAL === "1" || env.AGENT_RUNTIME_EPHEMERAL?.toLowerCase() === "true") {
    throw new Error("AGENT_RUNTIME_EPHEMERAL must be disabled in strict mode");
  }
  if (isMimoOnly(allowedModelBackends)) {
    for (const name of ["AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT", "AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST",
      "AGENT_RUNTIME_CODEX_AUTH_JSON_PATH", "CODEX_AUTH_JSON_PATH"] as const) {
      if (env[name] !== undefined) throw new Error(`${name} is forbidden in MiMo-only strict mode`);
    }
    if (pathsOverlap(workspaceRoot, stateRoot)) throw new Error("Strict workspace and state roots must be separate");
    mimoKeyFile(env.AGENT_RUNTIME_MIMO_API_KEY_FILE, workspaceRoot, stateRoot);
  } else {
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
  }
  const cliPath = file(env.AGENT_RUNTIME_CLI_PATH, "AGENT_RUNTIME_CLI_PATH");
  if (pathWithin(workspaceRoot, cliPath) || pathWithin(stateRoot, cliPath)) {
    throw new Error("AGENT_RUNTIME_CLI_PATH must be outside the workspace and state roots");
  }
  accessSync(cliPath, constants.X_OK);
  return { workspaceRoot, allowedModelBackends, allowedScope };
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
