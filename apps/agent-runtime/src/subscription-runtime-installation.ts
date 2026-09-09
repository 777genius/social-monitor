import { constants } from "node:fs";
import { access, lstat, readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  resolve,
  sep,
} from "node:path";

export const approvedSubscriptionRuntimePackageVersion =
  "0.1.0-main.42-sm.1";
export const approvedSubscriptionRuntimeLauncherSha256 =
  "36bdad8282a593107380545c25b607fe3a42aeb26e421b84f18f4fb7b60d096e";

// Repository wrapper approval, separate from the vendored package provenance.
// Pin the local import closure too: launcher bytes alone do not bind helpers.
// Changes to any member require a coordinated, reviewed admission update.
const approvedSubscriptionRuntimeDependencies = Object.freeze({
  "assessment-cli-progress.mjs":
    "f53430794ef6aaccf002dc47e7c7bbd0b2749a517556c0c46b261625ad24fe6d",
  "assessment-cli-lifecycle.mjs":
    "be50c50e909dd6aefcdc053df502cf5b4b94996d5bdd5b745c666b7a59c9eb42",
  "pinned-codex-native-binary.mjs":
    "77a32f1ed6f6429b11428c0501d0d5f1712cc8bd913c74027f4ad0204facfb21",
  "subscription-runtime-failure-details.mjs":
    "5c7e12660c4500a533cda147be44723019c8b223353f1e2d25c3483ff5a1484a",
  "codex-worker-cli-usage.mjs":
    "9a0c7d5f4f38d99eb9c91063c6773edda226884f98f9e611837015ddb2d325f9",
  "codex-auth-pool-manifest.mjs":
    "6e856a532a55e893d009e68c08cb7f0e2731bd21ab8f6029bbfc88d5cbbbeb25",
  "codex-auth-pool-routing.mjs":
    "5b76a13787a92852282488d5beec8ebb3bfd27f9dfbc059daa8bb521b5524c49",
  "subscription-runtime-purpose-model-policy.mjs":
    "0c60d62aa38ed04db9643f708a780e9dc72b337d8e0709f92d89d366f5a8f355",
  "reader-promotion-v2-canary-contract.cjs":
    "13432d41d7999d15f22880017e73cbd943c209db62161b2a6a2bec6b0766775c",
});

export type SubscriptionRuntimeInstallationIdentity = {
  /** Exact real path that was admitted and must be passed to spawn. */
  readonly executablePath: string;
  readonly packageRootRealpath: string;
  readonly runtimePackageVersion: string;
  readonly launcherSha256: string;
};

export interface SubscriptionRuntimeInstallationInspector {
  inspect(command: string): Promise<SubscriptionRuntimeInstallationIdentity>;
}

export class FileSubscriptionRuntimeInstallationInspector implements SubscriptionRuntimeInstallationInspector {
  async inspect(
    command: string,
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
    return {
      executablePath,
      packageRootRealpath: manifest.packageRootRealpath,
      runtimePackageVersion: manifest.version,
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
): Promise<{
  readonly name: string;
  readonly version: string;
  readonly packageRootRealpath: string;
}> => {
  const runtimeRequire = createRequire(executablePath);
  const manifestPath = await realpath(
    runtimeRequire.resolve("@vioxen/subscription-runtime/package.json"),
  );
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
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
