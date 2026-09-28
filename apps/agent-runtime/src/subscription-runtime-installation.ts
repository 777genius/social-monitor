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
// SHA256 of sorted "relative path\0file SHA256\n" records for executable
// package files. The base archive needs npm's locked dependency completion
// before it can load; only that complete installed distribution is admitted.
const approvedBaseRuntimeCodeSha256 = Object.freeze([
  "0d78cd98d9c347325646aaf6e6f551c0f897fbb11f740059c5d29f6ad930bf92",
]);
const approvedMimoRuntimeCodeSha256 =
  "6d3983f649a370d0b3e92927986041c8772d8c35e46190b04637bdff629bee15";
// Package code resolved from the installed node_modules ancestor while the
// wrapper imports the two runtime distributions, before it reads the key.
const approvedHoistedRuntimeCodeSha256 = Object.freeze({
  "@anthropic-ai/claude-agent-sdk": "bf27d0bddc44f33a0f0dd516da1d0c0b9fe13be2795d389496ba332f8f15f29b",
  "@modelcontextprotocol/sdk": "c0dfaaf3f69671ca3a5ab96ed4b58e93f04d65fbbff28a06d81181a932728623",
  "ajv-formats": "5b6d30a70952a2a2f40b566c0ea6d9ae22a7d52b711861a2211204f4896e014b",
  "zod": "38b42135ae2158e0bef62bfc41de465448f1c477019bc57f6f09725729efc7b6",
  "zod-to-json-schema": "dfa5db1415a820c6b35cba83fdb7b426a99e7910d25a64c86cb0387c33a9304b",
  "fast-uri": "65051f89a0767f5068bfe8b2c759f34f451865707491a73dcc6d145673956fb2",
  "fast-deep-equal": "ef90358dc24f1d8adfc86482be86320d506a0a82d19a4870bb921a5c1f6c2857",
  "json-schema-traverse": "644b5e21f4a48f3707c87adb7738240a9ddfae97928de64999165c246611ec24",
});
export const approvedSubscriptionRuntimeLauncherSha256 =
  "30f7bcac89439ea0eecb3260ee79924fcfab25a87e51be237e289c51f2ccddc1";

// Repository wrapper approval, separate from the vendored package provenance.
// Pin the local import closure too: launcher bytes alone do not bind helpers.
// Changes to any member require a coordinated, reviewed admission update.
const approvedSubscriptionRuntimeDependencies = Object.freeze({
  "assessment-cli-progress.mjs":
    "76e82b76acd1f8664e78980d7cc75d8485e73316fef183bb4ee97e2466bef002",
  "assessment-cli-lifecycle.mjs":
    "5220f2a668cf77f1d763a690dead7eb233e076e245d544870399f3d9f72423ca",
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
  const digest = await codeInventoryHash(packageRoot, ["package.json", "dist", "node_modules"]);
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
        if (/\.(?:js|cjs|mjs|json|node)$/.test(entry.name)) {
          entries.push(`${name}\0${createHash("sha256").update(await readFile(child)).digest("hex")}\n`);
        }
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
