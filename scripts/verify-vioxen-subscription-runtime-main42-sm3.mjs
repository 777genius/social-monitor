import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = "0.1.0-main.42-sm.3";
const artifactPath = join(
  projectRoot,
  `vendor/vioxen-subscription-runtime-${version}.tgz`,
);
const provenance = JSON.parse(
  await readFile(
    join(
      projectRoot,
      `vendor/vioxen-subscription-runtime-${version}.provenance.json`,
    ),
    "utf8",
  ),
);
const temporaryRoot = await mkdtemp(
  join(tmpdir(), "social-monitor-subscription-runtime-sm3-"),
);

try {
  assert.equal(provenance.schemaVersion, 1);
  assert.equal(
    provenance.sourceCommit,
    "7d3e29972ad0b8fcb6b6a12a02e025572e9bc251",
  );
  assert.equal(
    provenance.sourcePullRequest,
    "https://github.com/vioxen/subscription-runtime/pull/176",
  );
  assert.equal(provenance.packageVersion, version);
  assert.equal(provenance.upstreamPublicationClaimed, false);
  assert.equal(provenance.rebuildEvidence.runs, 2);
  assert.equal(provenance.rebuildEvidence.matchingSha256, provenance.sha256);

  for (const artifact of [
    provenance.parentArchive,
    provenance.oneShotHomePatch,
    { path: provenance.build.script, sha256: provenance.build.scriptSha256 },
  ]) {
    assert.equal(
      sha256(await readFile(join(projectRoot, artifact.path))),
      artifact.sha256,
      `${artifact.path} sha256 mismatch`,
    );
  }

  const artifactBytes = await readFile(artifactPath);
  assert.equal(sha256(artifactBytes), provenance.sha256);
  const currentRoot = join(temporaryRoot, "current");
  const parentRoot = join(temporaryRoot, "parent");
  await mkdir(currentRoot);
  await mkdir(parentRoot);
  run("tar", ["-xzf", artifactPath, "-C", currentRoot]);
  run("tar", [
    "-xzf",
    join(projectRoot, provenance.parentArchive.path),
    "-C",
    parentRoot,
  ]);

  const packageRoot = join(currentRoot, "package");
  const manifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, "@vioxen/subscription-runtime");
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.bundledDependencies, [
    "@vioxen/agent-account-observability",
  ]);
  const hostManifest = JSON.parse(
    await readFile(join(projectRoot, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(join(projectRoot, "package-lock.json"), "utf8"),
  );
  const dependency = "@vioxen/subscription-runtime";
  const pin = `file:vendor/vioxen-subscription-runtime-${version}.tgz`;
  assert.equal(hostManifest.dependencies[dependency], pin);
  assert.equal(lock.packages[""].dependencies[dependency], pin);
  const locked = lock.packages[`node_modules/${dependency}`];
  assert.equal(locked.version, manifest.version);
  assert.equal(locked.resolved, pin);
  assert.equal(
    locked.integrity,
    `sha512-${createHash("sha512").update(artifactBytes).digest("base64")}`,
  );
  assert.equal(
    sha256(
      await readFile(
        join(packageRoot, "dist/worker-local/agent-task-runner-cli.js"),
      ),
    ),
    provenance.launcherSha256,
  );

  const exportsSource = await readFile(
    join(packageRoot, "dist/worker-codex/index.js"),
    "utf8",
  );
  assert.match(exportsSource, /file-backend-codex-executor-factories/u);
  const factorySource = await readFile(
    join(
      packageRoot,
      "dist/worker-codex/file-backend-codex-executor-factories.js",
    ),
    "utf8",
  );
  assert.match(factorySource, /function createOneShotExecutor/u);
  assert.match(factorySource, /function createContinuationExecutor/u);
  const runtimeFactorySource = await readFile(
    join(
      packageRoot,
      "dist/worker-codex/file-backend-codex-runtime-factory.js",
    ),
    "utf8",
  );
  assert.match(runtimeFactorySource, /codexSessionHomePreservedOnDispose/u);

  const currentInventory = await fileInventory(packageRoot, "package");
  const retained = currentInventory.filter(
    ([path]) => path !== "package/package.json",
  );
  assert.equal(retained.length, provenance.nonManifestFiles);
  assert.equal(
    inventoryHash(retained),
    provenance.nonManifestInventorySha256,
  );
  const parentInventory = await fileInventory(
    join(parentRoot, "package"),
    "package",
  );
  const parentFiles = new Map(parentInventory);
  const currentFiles = new Map(currentInventory);
  const changedPaths = new Set([
    ...currentInventory
      .filter(([path, hash]) => parentFiles.get(path) !== hash)
      .map(([path]) => path),
    ...parentInventory
      .filter(([path]) => !currentFiles.has(path))
      .map(([path]) => path),
  ]);
  assert.equal(changedPaths.size, 24);
  for (const path of changedPaths) {
    assert.match(
      path,
      /^package\/(?:package\.json|dist\/worker-codex\/(?:codex-session-home-profile|file-backend-codex-executor-factories|file-backend-codex-runtime-factory|file-backend-codex-safe-executor|file-backend-codex-worker-options|index)\.(?:js|js\.map|d\.ts|d\.ts\.map))$/u,
    );
  }

  const sourceRoot = join(temporaryRoot, "source");
  await mkdir(sourceRoot);
  const parentProvenance = JSON.parse(
    await readFile(
      join(
        projectRoot,
        "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.2.provenance.json",
      ),
      "utf8",
    ),
  );
  run("tar", [
    "-xzf",
    join(projectRoot, parentProvenance.baseSource.path),
    "-C",
    sourceRoot,
  ]);
  for (const patch of [
    parentProvenance.reviewedSourcePatch.path,
    parentProvenance.quotaWirePatch.path,
    parentProvenance.capacityReasonPatch.path,
    provenance.oneShotHomePatch.path,
  ]) {
    run("git", ["apply", join(projectRoot, patch)], sourceRoot);
  }
  const sourceInventory = (
    await fileInventory(sourceRoot, "source", new Set(["dist", "node_modules"]))
  ).map(([path, hash]) => [path.slice("source/".length), hash]);
  assert.equal(sourceInventory.length, provenance.fixedSourceFiles);
  assert.equal(
    inventoryHash(sourceInventory),
    provenance.fixedSourceInventorySha256,
  );

  process.stdout.write(
    `subscription-runtime ${version} one-shot artifact verified from ${provenance.sourceCommit}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileInventory(root, prefix, ignored = new Set()) {
  const entries = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(root, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      entries.push(...(await fileInventory(path, name, ignored)));
    } else {
      assert.equal(entry.isFile(), true, `Unexpected non-file: ${name}`);
      entries.push([name, sha256(await readFile(path))]);
    }
  }
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function inventoryHash(entries) {
  return sha256(entries.map(([path, hash]) => `${path}\0${hash}\n`).join(""));
}
