import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseArtifact = join(
  projectRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.2-sm.1.tgz",
);
const patchPath = join(
  projectRoot,
  "vendor/patches/vioxen-subscription-runtime-0.1.0-main.2-sm.2.patch",
);
const outputArtifact = join(
  projectRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.2-sm.2.tgz",
);
const baseSha256 =
  "cb97f7e40e09a9f4db3cd6f0663deca35e4b3214c3a3e36177cfb8db97884d6b";

const checkOnly = process.argv.slice(2).includes("--check");
const tempRoot = await mkdtemp(
  join(tmpdir(), "social-monitor-subscription-runtime-sm2-"),
);

try {
  await assertSha256(baseArtifact, baseSha256, "sm.1 base artifact");
  run("tar", ["-xzf", baseArtifact, "-C", tempRoot]);
  const packageRoot = join(tempRoot, "package");
  run("patch", ["-p1", "--forward", "--batch", "-i", patchPath], packageRoot);
  await assertPatchedManifest(packageRoot);

  const generatedArtifact = join(tempRoot, "sm.2.tgz");
  run("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--format=ustar",
    "-czf",
    generatedArtifact,
    "-C",
    tempRoot,
    "package",
  ]);

  if (checkOnly) {
    await assertSameBytes(generatedArtifact, outputArtifact);
    process.stdout.write("subscription-runtime sm.2 artifact is reproducible\n");
  } else {
    await copyFile(generatedArtifact, outputArtifact);
    process.stdout.write(
      `wrote ${outputArtifact} (${await sha256(outputArtifact)})\n`,
    );
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status ?? "signal"}): ${result.stderr.trim()}`,
    );
  }
}

async function assertPatchedManifest(packageRoot) {
  const manifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  if (
    manifest.name !== "@vioxen/subscription-runtime" ||
    manifest.version !== "0.1.0-main.2-sm.2"
  ) {
    throw new Error("subscription-runtime patch produced an invalid manifest");
  }
}

async function assertSha256(path, expected, label) {
  const actual = await sha256(path);
  if (actual !== expected) {
    throw new Error(`${label} sha256 mismatch: ${actual}`);
  }
}

async function assertSameBytes(actualPath, expectedPath) {
  const [actual, expected] = await Promise.all([
    readFile(actualPath),
    readFile(expectedPath),
  ]);
  if (!actual.equals(expected)) {
    throw new Error(
      `vendored artifact is stale: run node ${fileURLToPath(import.meta.url)}`,
    );
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
