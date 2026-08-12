import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const CODEX_AUTH_POOL_ROOT_ENV =
  "AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT";
export const CODEX_AUTH_POOL_MANIFEST_ENV =
  "AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST";

const maximumAccounts = 16;
const maximumManifestBytes = 64 * 1024;
const maximumAuthBytes = 1024 * 1024;
const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export async function loadCodexAuthPoolFromEnv(env = process.env) {
  const rootInput = nonEmpty(env[CODEX_AUTH_POOL_ROOT_ENV]);
  const manifestInput = nonEmpty(env[CODEX_AUTH_POOL_MANIFEST_ENV]);
  if (rootInput === undefined && manifestInput === undefined) return undefined;
  if (rootInput === undefined || manifestInput === undefined) {
    throw new Error(
      `${CODEX_AUTH_POOL_ROOT_ENV} and ${CODEX_AUTH_POOL_MANIFEST_ENV} must be configured together`,
    );
  }

  const rootPath = await secureRoot(rootInput);
  const absoluteManifestPath = resolve(manifestInput);
  const rootAliases = [rootPath, resolve(rootInput)];
  const manifestPath = await secureFile({
    rootPath,
    candidatePath:
      isAbsolute(manifestInput) &&
      rootAliases.some(
        (alias) =>
          absoluteManifestPath === alias ||
          absoluteManifestPath.startsWith(`${alias}${sep}`),
      )
      ? manifestInput
      : join(rootPath, manifestInput),
    label: "Codex auth pool manifest",
    maximumBytes: maximumManifestBytes,
  });
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));
  const accounts = [];
  for (const account of manifest.accounts) {
    accounts.push({
      id: account.id,
      authJsonPath: await secureFile({
        rootPath,
        candidatePath: join(rootPath, account.relativePath),
        label: `Codex auth snapshot for ${account.id}`,
        maximumBytes: maximumAuthBytes,
      }),
    });
  }

  return Object.freeze({
    rootPath,
    manifestPath,
    snapshotId: manifest.snapshotId,
    accounts: Object.freeze(accounts.map(Object.freeze)),
  });
}

function parseManifest(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Codex auth pool manifest must contain valid JSON");
  }
  assertPlainObject(parsed, "Codex auth pool manifest");
  assertExactKeys(parsed, ["accounts", "schemaVersion", "snapshotId"]);
  if (parsed.schemaVersion !== 1) {
    throw new Error("Codex auth pool manifest schemaVersion must be 1");
  }
  assertIdentifier(parsed.snapshotId, "snapshotId");
  if (
    !Array.isArray(parsed.accounts) ||
    parsed.accounts.length < 1 ||
    parsed.accounts.length > maximumAccounts
  ) {
    throw new Error(
      `Codex auth pool manifest accounts must contain 1-${maximumAccounts} entries`,
    );
  }

  const ids = new Set();
  const paths = new Set();
  const accounts = parsed.accounts.map((value, index) => {
    assertPlainObject(value, `accounts[${index}]`);
    assertExactKeys(value, ["id", "relativePath"]);
    assertIdentifier(value.id, `accounts[${index}].id`);
    if (ids.has(value.id)) {
      throw new Error(`Codex auth pool account id is duplicated: ${value.id}`);
    }
    ids.add(value.id);

    const relativePath = secureRelativePath(
      value.relativePath,
      `accounts[${index}].relativePath`,
    );
    if (paths.has(relativePath)) {
      throw new Error(
        `Codex auth pool relativePath is duplicated: ${relativePath}`,
      );
    }
    paths.add(relativePath);
    return { id: value.id, relativePath };
  });

  return { snapshotId: parsed.snapshotId, accounts };
}

async function secureRoot(rootInput) {
  const requestedRoot = resolve(rootInput);
  const requestedStat = await lstat(requestedRoot);
  if (requestedStat.isSymbolicLink() || !requestedStat.isDirectory()) {
    throw new Error("Codex auth pool root must be a real directory");
  }
  assertImmutableMode(requestedStat.mode, "Codex auth pool root");
  const rootPath = await realpath(requestedRoot);
  const rootStat = await lstat(rootPath);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("Codex auth pool root must resolve to a real directory");
  }
  assertImmutableMode(rootStat.mode, "Codex auth pool root");
  return rootPath;
}

async function secureFile({ rootPath, candidatePath, label, maximumBytes }) {
  const requestedPath = resolve(candidatePath);
  const requestedRelativePath = relative(rootPath, requestedPath);
  assertContainedPath(requestedRelativePath, label);
  await assertPathSegments({
    rootPath,
    relativePath: requestedRelativePath,
    label,
    maximumBytes,
  });

  const canonicalPath = await realpath(requestedPath);
  assertContainedPath(relative(rootPath, canonicalPath), label);
  return canonicalPath;
}

async function assertPathSegments({
  rootPath,
  relativePath,
  label,
  maximumBytes,
}) {
  let currentPath = rootPath;
  const segments = relativePath.split(sep);
  for (const [index, segment] of segments.entries()) {
    currentPath = join(currentPath, segment);
    const currentStat = await lstat(currentPath);
    if (currentStat.isSymbolicLink()) {
      throw new Error(`${label} must not use symbolic links`);
    }
    assertImmutableMode(currentStat.mode, label);
    if (index < segments.length - 1 && !currentStat.isDirectory()) {
      throw new Error(`${label} parent must be a directory`);
    }
    if (index === segments.length - 1) {
      if (!currentStat.isFile()) {
        throw new Error(`${label} must be a regular file`);
      }
      if (currentStat.size < 1 || currentStat.size > maximumBytes) {
        throw new Error(`${label} has an invalid size`);
      }
    }
  }
}

function assertContainedPath(relativePath, label) {
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${label} must stay inside the configured pool root`);
  }
}

function secureRelativePath(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value === "") {
    throw new Error(`${label} must be a non-empty normalized string`);
  }
  if (isAbsolute(value) || value.includes("\\")) {
    throw new Error(`${label} must be a POSIX-style relative path`);
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`${label} must not contain empty or traversal segments`);
  }
  return segments.join("/");
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !safeIdentifier.test(value)) {
    throw new Error(`${label} must be a safe identifier`);
  }
}

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function assertExactKeys(value, allowedKeys) {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...allowedKeys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `Codex auth pool manifest has unexpected fields: ${actualKeys.join(",")}`,
    );
  }
}

function assertImmutableMode(mode, label) {
  if ((mode & 0o022) !== 0) {
    throw new Error(`${label} must not be group- or world-writable`);
  }
}

function nonEmpty(value) {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
