import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

export function assertImmutableRecoveryInputs(params: {
  readonly recoveryRoot: string;
  readonly inputPaths: readonly string[];
  readonly forbiddenOutputPaths: readonly string[];
}): readonly string[] {
  const root = realpathSync(params.recoveryRoot);
  const outputIdentities = params.forbiddenOutputPaths.map(fileIdentity);
  const inputs = params.inputPaths.map((path) => {
    if (!isAbsolute(path)) {
      throw new Error("Recovery input paths must be absolute");
    }
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o222) !== 0) {
      throw new Error("Recovery inputs must be immutable regular files");
    }
    const canonical = realpathSync(path);
    if (!pathIsInside(root, canonical)) {
      throw new Error("Recovery inputs must be inside the recovery directory");
    }
    const identity = fileIdentity(canonical);
    if (
      outputIdentities.some(
        (output) =>
          output.canonical === identity.canonical ||
          (output.inode !== null && output.inode === identity.inode),
      )
    ) {
      throw new Error("Recovery input aliases a production output");
    }
    return canonical;
  });
  if (new Set(inputs).size !== inputs.length) {
    throw new Error("Recovery input paths must be distinct");
  }
  return inputs;
}

function fileIdentity(path: string): {
  readonly canonical: string;
  readonly inode: string | null;
} {
  const absolute = resolve(path);
  try {
    const canonical = realpathSync(absolute);
    const stat = statSync(canonical);
    return { canonical, inode: `${stat.dev}:${stat.ino}` };
  } catch (error) {
    if (isMissingFile(error)) {
      return { canonical: absolute, inode: null };
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function assertRecoveryOutputPath(params: {
  readonly recoveryRoot: string;
  readonly outputPath: string;
}): string {
  if (!isAbsolute(params.outputPath)) {
    throw new Error("Recovery manifest output path must be absolute");
  }
  const root = realpathSync(params.recoveryRoot);
  const parent = realpathSync(dirname(params.outputPath));
  const output = resolve(parent, basename(params.outputPath));
  if (!pathIsInside(root, output)) {
    throw new Error(
      "Recovery manifest output must be inside recovery directory",
    );
  }
  return output;
}

function pathIsInside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child.length > 0 && !child.startsWith("..") && !isAbsolute(child);
}
