import { resolve } from "node:path";

export type ReaderSummaryMultiDayQualityCliOptions =
  | {
      readonly mode: "legacy_observational";
    }
  | {
      readonly mode: "artifact_only";
      readonly outputPath: string;
      readonly goldPath: string;
      readonly targetManifestPath: string;
    }
  | {
      readonly mode: "blocking" | "migration_diagnostic";
      readonly update: boolean;
      readonly outputPath: string;
      readonly goldPath: string;
      readonly targetManifestPath: string;
    };

const valueOptions = new Set(["--target-manifest", "--output", "--gold"]);
const flagOptions = new Set([
  "--update",
  "--artifact-only",
  "--legacy-observational",
  "--migration-diagnostic",
]);

export function parseReaderSummaryMultiDayQualityCli(params: {
  readonly args: readonly string[];
  readonly defaultOutputPath: string;
  readonly defaultGoldPath: string;
}): ReaderSummaryMultiDayQualityCliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < params.args.length; index += 1) {
    const token = params.args[index];
    if (token === undefined) {
      continue;
    }
    if (valueOptions.has(token)) {
      if (values.has(token)) {
        throw new Error(`${token} must be provided at most once`);
      }
      const value = params.args[index + 1];
      if (
        value === undefined ||
        value.startsWith("--") ||
        value.trim() === ""
      ) {
        throw new Error(`${token} requires a value`);
      }
      values.set(token, value);
      index += 1;
      continue;
    }
    if (flagOptions.has(token)) {
      if (flags.has(token)) {
        throw new Error(`${token} must be provided at most once`);
      }
      flags.add(token);
      continue;
    }
    if (token === "--allow-degraded") {
      throw new Error(
        "--allow-degraded is unsupported by the v3 report / v4 evaluator blocking gate",
      );
    }
    throw new Error(`Unsupported argument: ${token}`);
  }

  const update = flags.has("--update");
  const artifactOnly = flags.has("--artifact-only");
  const legacy = flags.has("--legacy-observational");
  const migration = flags.has("--migration-diagnostic");
  const targetManifestPath = values.get("--target-manifest");
  const outputOption = values.get("--output");
  const goldOption = values.get("--gold");

  if (legacy) {
    if (
      update ||
      artifactOnly ||
      migration ||
      targetManifestPath !== undefined ||
      outputOption !== undefined ||
      goldOption !== undefined
    ) {
      throw new Error(
        "--legacy-observational cannot be combined with other options",
      );
    }
    return { mode: "legacy_observational" };
  }

  const outputPath = outputOption ?? params.defaultOutputPath;
  const goldPath = goldOption ?? params.defaultGoldPath;
  if (artifactOnly) {
    if (update || migration) {
      throw new Error(
        "--artifact-only cannot be combined with --update or --migration-diagnostic",
      );
    }
    if (targetManifestPath === undefined) {
      throw new Error(
        "--artifact-only requires an explicit reviewed --target-manifest v4 file",
      );
    }
    return {
      mode: "artifact_only",
      outputPath,
      goldPath,
      targetManifestPath,
    };
  }

  if (targetManifestPath === undefined) {
    throw new Error(
      "The blocking gate requires a reviewed --target-manifest v4 file",
    );
  }
  if (migration) {
    if (!update || goldOption === undefined || outputOption === undefined) {
      throw new Error(
        "--migration-diagnostic requires --update, --gold and --output",
      );
    }
    if (resolve(outputPath) === resolve(params.defaultOutputPath)) {
      throw new Error(
        "--migration-diagnostic cannot write the default v3 report path",
      );
    }
  }

  return {
    mode: migration ? "migration_diagnostic" : "blocking",
    update,
    outputPath,
    goldPath,
    targetManifestPath,
  };
}
