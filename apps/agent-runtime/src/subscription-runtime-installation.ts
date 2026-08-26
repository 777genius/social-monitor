import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
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
  "0.1.0-main.2-sm.1";
export const approvedSubscriptionRuntimeLauncherSha256 =
  "76e58a137bfd4732979b3b78fc9d4624403d968c37cc36d6c6dec1f81e153c12";

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
