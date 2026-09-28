import { constants } from "node:fs";
import { access, lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export const approvedSubscriptionRuntimePackageVersion =
  "0.1.0-main.42-sm.3";
export const approvedMimoRuntimePackageVersion =
  "0.1.0-main.40-sm-mimo.5";
const approvedMimoManifestSha256 =
  "132bae9074c729d9626cab9f765df8b6e8446dac172f3964dedcc6a2fe6d635f";
const approvedMimoWorkerEntrypointSha256 =
  "43907edb05db2a3ad733697877cacd5caa434cb301a5ec4da11bd256cdf6ae09";
// SHA256 of sorted "relative path\0file SHA256\n" records for all regular
// distribution files. The base archive needs npm's locked dependency completion
// before it can load; only that complete installed distribution is admitted.
const approvedBaseRuntimeCodeSha256 = Object.freeze([
  "0b1ae195815bd45ce2aab77cb4345e4ea07e2af70410527959bf810792669512",
]);
const approvedMimoRuntimeCodeSha256 =
  "3e08af06465d6bf5d2fbe3ecd1d5d8ea6baed1a3844dc0bc39195a7199442ec7";
// Package code resolved from the installed node_modules ancestor while the
// wrapper imports the two runtime distributions, before it reads the key.
const approvedHoistedRuntimeCodeSha256 = Object.freeze({
  "@anthropic-ai/claude-agent-sdk": "68eeb7ef642c42e16cb13c3c0d00e2bc72960906e816f8e9bcb91ca7f3bbf3ae",
  "@modelcontextprotocol/sdk": "3b1ce6a1229fca3c0c7b33838c7b2c67630d3e56a24b5407e9ce13f7dcbd3c25",
  "ajv-formats": "444dbf1804b17fc0d114a28ee8fd89963c7084c08b5ebbd16c408b5e089727b4",
  "zod": "4d7f8ca54064f57c6d93f09d2ce3b028f8d8884193147495f5f283a0916e124c",
  "zod-to-json-schema": "e6f0b7c6dc6c820f1cdd16b9ef9a7f415190e3ee0bf190e9605f620344f0090a",
  "fast-uri": "5527eab2950f0500863098edbf2a8d80894b4851a5189fbc5c2bac20a16b8ce7",
  "fast-deep-equal": "da223f84496561579e85d5f6c0181f84a08db50f250912578c54e145e7b8b00e",
  "json-schema-traverse": "e027afb34851b07a5cc5186b3a6d76b3273214474a35b13dacce9a15b0d309db",
});
export const approvedSubscriptionRuntimeLauncherSha256 =
  "bc1ddab061dfaa8ad967aff1480eeeca4a7235f5961dfb29e440d2648d41c8f4";

// Repository wrapper approval, separate from the vendored package provenance.
// Pin the local import closure too: launcher bytes alone do not bind helpers.
// Changes to any member require a coordinated, reviewed admission update.
const approvedSubscriptionRuntimeDependencies = Object.freeze({
  "assessment-cli-progress.mjs":
    "76e82b76acd1f8664e78980d7cc75d8485e73316fef183bb4ee97e2466bef002",
  "assessment-cli-lifecycle.mjs":
    "094a5c323b838b22d6869696e923540e5627d1d261bc3040f2298d06877a82f8",
  "mimo-app-server-custody.mjs":
    "ca82aadb185205bec1faec471c3cd0b71104d0be0dc881140470cdf5645a7456",
  "installed-runtime-modules.mjs":
    "b4b95cc23ee0680c8c03559fc17872434593f6d00ed04f2482fe229f9eefe7bc",
  "pinned-codex-native-binary.mjs":
    "77a32f1ed6f6429b11428c0501d0d5f1712cc8bd913c74027f4ad0204facfb21",
  "subscription-runtime-failure-details.mjs":
    "5c7e12660c4500a533cda147be44723019c8b223353f1e2d25c3483ff5a1484a",
  "mimo-key-file.mjs":
    "bbf162e60af77cfbd87efe636e5e5ee2aa15c1456d2aef84b56c2ff5ab128dcd",
  "codex-worker-cli-usage.mjs":
    "9a0c7d5f4f38d99eb9c91063c6773edda226884f98f9e611837015ddb2d325f9",
  "codex-auth-pool-manifest.mjs":
    "6e856a532a55e893d009e68c08cb7f0e2731bd21ab8f6029bbfc88d5cbbbeb25",
  "codex-auth-pool-routing.mjs":
    "5b76a13787a92852282488d5beec8ebb3bfd27f9dfbc059daa8bb521b5524c49",
  "subscription-runtime-purpose-model-policy.mjs":
    "cea9f7361b142779e3b4e674ec6ff3abed83c819998ec725e8fd4f78f3190ff7",
  "reader-promotion-v2-canary-contract.cjs":
    "13432d41d7999d15f22880017e73cbd943c209db62161b2a6a2bec6b0766775c",
});

export type SubscriptionRuntimeInstallationIdentity = {
  /** Exact real path that was admitted and must be passed to spawn. */
  readonly executablePath: string;
  readonly packageRootRealpath: string;
  readonly runtimePackageVersion: string;
  readonly mimoRuntimePackageVersion?: string;
  readonly launcherSha256: string;
};

export interface SubscriptionRuntimeInstallationInspector {
  inspect(command: string, modelBackend?: "xiaomi-mimo-token-plan"):
    Promise<SubscriptionRuntimeInstallationIdentity>;
}

export class FileSubscriptionRuntimeInstallationInspector implements SubscriptionRuntimeInstallationInspector {
  constructor(private readonly workspaceRoot?: string) {}

  async inspect(
    command: string,
    modelBackend?: "xiaomi-mimo-token-plan",
  ): Promise<SubscriptionRuntimeInstallationIdentity> {
    const executablePath = await resolveSubscriptionRuntimeExecutable(command);
    const launcherBytes = await readFile(executablePath);
    const launcherSha256 = createHash("sha256")
      .update(launcherBytes)
      .digest("hex");
    if (launcherSha256 !== approvedSubscriptionRuntimeLauncherSha256) {
      throw new Error("Agent runtime launcher bytes are not approved");
    }

    for (const [name, approvedSha256] of Object.entries(
      approvedSubscriptionRuntimeDependencies,
    )) {
      const dependencyPath = join(dirname(executablePath), name);
      // Node resolves helper symlinks before loading their adjacent imports.
      // Require local regular files so the pinned closure is the loaded closure.
      if (!(await lstat(dependencyPath)).isFile()) {
        throw new Error(`Agent runtime launcher dependency is not a regular file: ${name}`);
      }
      const dependencyBytes = await readFile(dependencyPath);
      if (createHash("sha256").update(dependencyBytes).digest("hex") !== approvedSha256) {
        throw new Error(`Agent runtime launcher dependency bytes are not approved: ${name}`);
      }
    }

    const manifest = await readInstalledManifest(executablePath);
    if (
      manifest.name !== "@vioxen/subscription-runtime" ||
      manifest.version !== approvedSubscriptionRuntimePackageVersion
    ) {
      throw new Error("Installed subscription runtime version is not approved");
    }
    const mimoManifest = modelBackend === "xiaomi-mimo-token-plan"
      ? await readInstalledManifest(executablePath, "@vioxen/subscription-runtime-mimo/package.json")
      : undefined;
    if (mimoManifest !== undefined &&
        (mimoManifest.name !== "@vioxen/subscription-runtime" ||
          mimoManifest.version !== approvedMimoRuntimePackageVersion)) {
      throw new Error("Installed MiMo subscription runtime version is not approved");
    }
    if (mimoManifest !== undefined) {
      await inspectMimoRuntimeArtifacts(mimoManifest, this.workspaceRoot);
      await inspectPackageCode(manifest, this.workspaceRoot, approvedBaseRuntimeCodeSha256);
      await inspectPackageCode(mimoManifest, this.workspaceRoot, [approvedMimoRuntimeCodeSha256]);
      await inspectHoistedRuntimeCode(manifest, mimoManifest, this.workspaceRoot);
    }
    return {
      executablePath,
      packageRootRealpath: manifest.packageRootRealpath,
      runtimePackageVersion: manifest.version,
      ...(mimoManifest === undefined ? {} : { mimoRuntimePackageVersion: mimoManifest.version }),
      launcherSha256,
    };
  }
}

export const resolveSubscriptionRuntimeExecutable = async (
  command: string,
): Promise<string> => {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    throw new Error("Agent runtime launcher command is empty");
  }

  const candidates = isAbsolute(trimmed)
    ? [trimmed]
    : trimmed.includes(sep)
      ? [resolve(process.cwd(), trimmed)]
      : (process.env.PATH ?? "")
          .split(delimiter)
          .filter((directory) => directory.trim().length > 0)
          .map((directory) => join(directory, trimmed));

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      const candidateStat = await stat(candidate);
      if (!candidateStat.isFile()) {
        continue;
      }
      return await realpath(candidate);
    } catch {
      // PATH lookup has execvp semantics: missing and non-executable entries
      // are skipped until an executable candidate is found.
    }
  }
  throw new Error("Agent runtime launcher command cannot be resolved");
};

const readInstalledManifest = async (
  executablePath: string,
  packageSpecifier = "@vioxen/subscription-runtime/package.json",
): Promise<{
  readonly name: string;
  readonly version: string;
  readonly packageRootRealpath: string;
  readonly manifestPath: string;
  readonly manifestRealpath: string;
}> => {
  const runtimeRequire = createRequire(executablePath);
  const manifestPath = runtimeRequire.resolve(packageSpecifier);
  const manifestRealpath = await realpath(manifestPath);
  if (packageSpecifier === "@vioxen/subscription-runtime-mimo/package.json" &&
      (!(await lstat(manifestPath)).isFile() || !(await lstat(dirname(manifestPath))).isDirectory())) {
    throw new Error("Installed MiMo subscription runtime package and manifest must be regular installation entries");
  }
  const parsed: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!isRecord(parsed) || typeof parsed.name !== "string") {
    throw new Error("Installed subscription runtime manifest is malformed");
  }
  if (
    typeof parsed.version !== "string" ||
    parsed.version.trim().length === 0
  ) {
    throw new Error("Installed subscription runtime version is unknown");
  }
  return {
    name: parsed.name,
    version: parsed.version,
    packageRootRealpath: await realpath(dirname(manifestPath)),
    manifestPath,
    manifestRealpath,
  };
};

const within = (root: string, candidate: string): boolean => {
  const child = relative(root, candidate);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
};

const inspectMimoRuntimeArtifacts = async (
  manifest: { readonly packageRootRealpath: string; readonly manifestPath: string; readonly manifestRealpath: string },
  workspaceRoot?: string,
): Promise<void> => {
  const packageRoot = manifest.packageRootRealpath;
  if (workspaceRoot !== undefined &&
      (within(workspaceRoot, packageRoot) || within(workspaceRoot, manifest.manifestRealpath))) {
    throw new Error("Installed MiMo subscription runtime must be outside the admitted workspace");
  }
  if (dirname(manifest.manifestRealpath) !== packageRoot) {
    throw new Error("Installed MiMo subscription runtime manifest escapes the selected package");
  }
  if (createHash("sha256").update(await readFile(manifest.manifestPath)).digest("hex") !==
      approvedMimoManifestSha256) {
    throw new Error("Installed MiMo subscription runtime manifest bytes are not approved");
  }
  const workerPath = join(packageRoot, "dist", "worker-codex", "index.js");
  for (const path of [join(packageRoot, "dist"), join(packageRoot, "dist", "worker-codex"), workerPath]) {
    const metadata = await lstat(path);
    if (path === workerPath ? !metadata.isFile() : !metadata.isDirectory()) {
      throw new Error("Installed MiMo subscription runtime worker entrypoint is not a regular installation artifact");
    }
  }
  if (createHash("sha256").update(await readFile(workerPath)).digest("hex") !==
      approvedMimoWorkerEntrypointSha256) {
    throw new Error("Installed MiMo subscription runtime worker entrypoint bytes are not approved");
  }
};

const inspectPackageCode = async (
  manifest: { readonly packageRootRealpath: string; readonly manifestPath: string; readonly manifestRealpath: string },
  workspaceRoot: string | undefined,
  approvedHashes: readonly string[],
): Promise<void> => {
  const packageRoot = manifest.packageRootRealpath;
  if (workspaceRoot !== undefined &&
      (within(workspaceRoot, packageRoot) || within(workspaceRoot, manifest.manifestRealpath))) {
    throw new Error("Installed subscription runtime code must be outside the admitted workspace");
  }
  if (!(await lstat(dirname(manifest.manifestPath))).isDirectory() ||
      !(await lstat(manifest.manifestPath)).isFile() ||
      dirname(manifest.manifestRealpath) !== packageRoot) {
    throw new Error("Installed subscription runtime package must contain a regular manifest");
  }
  const digest = await codeInventoryHash(packageRoot, ["."]);
  if (!approvedHashes.includes(digest)) {
    throw new Error("Installed subscription runtime code bytes are not approved");
  }
};

const codeInventoryHash = async (root: string, selected: readonly string[]): Promise<string> => {
  const entries: string[] = [];
  const visit = async (path: string, prefix: string): Promise<void> => {
    if (!(await lstat(path)).isDirectory()) {
      throw new Error(`Installed subscription runtime code directory is not regular: ${prefix}`);
    }
    for (const entry of await readdir(path, { withFileTypes: true })) {
      // npm's .bin links are command aliases, not imported package code.
      if (entry.name === ".bin" && (prefix === "node_modules" || prefix.endsWith("/node_modules"))) continue;
      const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        await visit(child, name);
      } else if (entry.isFile()) {
        entries.push(`${name}\0${createHash("sha256").update(await readFile(child)).digest("hex")}\n`);
      } else {
        throw new Error(`Installed subscription runtime code contains a non-regular entry: ${name}`);
      }
    }
  };
  for (const name of selected) {
    const path = name === "." ? root : join(root, name);
    const metadata = await lstat(path);
    if (metadata.isDirectory()) {
      await visit(path, name === "." ? "" : name);
    } else if (metadata.isFile() && name === "package.json") {
      entries.push(`${name}\0${createHash("sha256").update(await readFile(path)).digest("hex")}\n`);
    } else {
      throw new Error(`Installed subscription runtime code entry is not regular: ${name}`);
    }
  }
  return createHash("sha256").update(entries.sort().join("")).digest("hex");
};

const inspectHoistedRuntimeCode = async (
  base: { readonly packageRootRealpath: string },
  mimo: { readonly packageRootRealpath: string },
  workspaceRoot: string | undefined,
): Promise<void> => {
  const moduleRoots = new Set([base.packageRootRealpath, mimo.packageRootRealpath]
    .map((packageRoot) => dirname(dirname(packageRoot))));
  for (const modulesRoot of moduleRoots) {
    for (const [name, approvedHash] of Object.entries(approvedHoistedRuntimeCodeSha256)) {
      const externalPath = await realpath(join(modulesRoot, name));
      if (workspaceRoot !== undefined && within(workspaceRoot, externalPath)) {
        throw new Error(`Installed runtime import is inside the admitted workspace: ${name}`);
      }
      if (await codeInventoryHash(externalPath, ["."]) !== approvedHash) {
        throw new Error(`Installed runtime import bytes are not approved: ${name}`);
      }
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
