import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifyNativeQuota } from "./verify-vioxen-subscription-runtime-main42-native.mjs";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wireFix = process.argv.includes("--quota-wire-fix");
assert.ok(process.argv.slice(2).every((arg) => arg === "--quota-wire-fix"), "Unknown verifier option");
const version = wireFix ? "0.1.0-main.42-sm.1" : "0.1.0-main.42";
const artifactPath = join(
  projectRoot,
  `vendor/vioxen-subscription-runtime-${version}.tgz`,
);
const provenancePath = join(
  projectRoot,
  `vendor/vioxen-subscription-runtime-${version}.provenance.json`,
);
const tempRoot = await mkdtemp(
  join(tmpdir(), "social-monitor-subscription-runtime-main42-"),
);

try {
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  assert.equal(wireFix ? provenance.reviewedParentSourceCommit : provenance.sourceCommit, "22db9bbca1c2315e93211887a7738a6b40f21167");
  if (wireFix) assert.equal(provenance.sourceCommit, null);
  assert.equal(provenance.baseCommit, "42ea16961987f8a626a5219b030a5029f28bcdfd");
  assert.equal(provenance.upstreamPublicationClaimed, false);
  assert.equal(provenance.approvedArchiveSha256, "d67569a97ee0b91d8ce7d989532c44ec58673190101cc5f481730e2f1af4aac3");
  assert.equal(provenance.upstreamPackageVersion, "0.1.0-main.40");
  assert.equal(provenance.packageVersion, version);
  assert.equal(provenance.packageVersionIsLocal, true);
  for (const artifact of [provenance.baseSource, provenance.reviewedSourcePatch]) {
    assert.equal(sha256(await readFile(join(projectRoot, artifact.path))), artifact.sha256);
  }
  const artifactBytes = await readFile(artifactPath);
  assert.equal(
    createHash("sha256").update(artifactBytes).digest("hex"),
    provenance.sha256,
    "subscription-runtime artifact sha256 mismatch",
  );
  run("tar", ["-xzf", artifactPath, "-C", tempRoot]);
  const packageRoot = join(tempRoot, "package");
  const manifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, "@vioxen/subscription-runtime");
  assert.equal(manifest.version, provenance.packageVersion);
  assert.deepEqual(manifest.bundledDependencies, [
    "@vioxen/agent-account-observability",
  ]);
  assert.equal(provenance.packagingProfile, "thin-bundle-agent-account-observability-v1");

  const launcherPath = join(
    packageRoot,
    "dist/worker-local/agent-task-runner-cli.js",
  );
  const launcherBytes = await readFile(launcherPath);
  assert.equal(
    createHash("sha256").update(launcherBytes).digest("hex"),
    provenance.launcherSha256,
    "subscription-runtime launcher sha256 mismatch",
  );

  const client = await readFile(
    join(
      packageRoot,
      "dist/provider-codex/app-server/application/app-server-client.js",
    ),
    "utf8",
  );
  assert.match(client, /account\/rateLimits\/read/u);
  assert.match(client, /account\/rateLimits\/updated/u);
  await readFile(
    join(
      packageRoot,
      "dist/provider-codex/app-server/application/app-server-rate-limits-monitor.js",
    ),
  );
  await readFile(
    join(
      packageRoot,
      "dist/worker-codex/application/codex-live-quota-capacity.js",
    ),
  );

  assert.match(client, /thread\/tokenUsage\/updated/u);

  // The P0 this artifact exists to close: turn usage must come from the exact
  // per-update `.last` snapshot, and a malformed snapshot must poison the turn
  // instead of silently falling back to the cumulative counter.
  const usageDomain = await readFile(
    join(
      packageRoot,
      "dist/provider-codex/app-server/domain/app-server-usage.js",
    ),
    "utf8",
  );
  assert.match(
    usageDomain,
    /export function readExactTurnUsage/u,
    "vendored artifact predates the exact per-turn usage reader",
  );

  for (const relativePath of [
    "dist/provider-codex/app-server/application/app-server-turn-usage.js",
    "dist/provider-codex/app-server/application/app-server-turn-state.js",
    "dist/provider-codex/app-server/application/app-server-goal-runner.js",
  ]) {
    const source = await readFile(join(packageRoot, relativePath), "utf8");
    assert.match(
      source,
      /usagePoisoned/u,
      `${relativePath} does not carry fail-closed usage poisoning`,
    );
  }

  const archiveEntries = run("tar", ["-tzf", artifactPath]).stdout
    .split("\n")
    .filter((entry) => entry.startsWith("package/node_modules/") && entry);
  assert.equal(archiveEntries.length > 0, true);
  assert.equal(
    archiveEntries.every((entry) =>
      entry.startsWith(
        "package/node_modules/@vioxen/agent-account-observability/",
      )),
    true,
    "thin vendor artifact contains an unexpected bundled dependency",
  );
  // This inventory covers every retained file, including maps, declarations,
  // runtime modules and the bundled reader; its baseline is the approved pack.
  const inventory = await fileInventory(packageRoot, "package");
  const retained = inventory.filter(([path]) => path !== "package/package.json");
  assert.equal(retained.length, provenance.nonManifestFiles);
  assert.equal(inventoryHash(retained), provenance.nonManifestInventorySha256);
  const historicalRoot = join(tempRoot, "historical");
  await mkdir(historicalRoot);
  run("tar", ["-xzf", join(projectRoot, "vendor/vioxen-subscription-runtime-0.1.0-main.41.tgz"), "-C", historicalRoot]);
  const historicalManifest = JSON.parse(await readFile(join(historicalRoot, "package/package.json"), "utf8"));
  assert.deepEqual(manifest, { ...historicalManifest, version });
  // All exact-turn usage implementations are unchanged from main.41.
  for (const [path, hash] of await fileInventory(join(historicalRoot, "package"), "package")) {
    if (path.startsWith("package/dist/provider-codex/app-server/")) {
      assert.equal(sha256(await readFile(join(tempRoot, path))), hash, path);
    }
  }
  for (const [path, hash] of Object.entries({
    "dist/worker-codex/adapters/codex-quota-snapshot-observation.js": "893ae667bf4b401e0ecaaf7d35993cdb195a3a5f435358357fa8c44d44d118f5",
    "dist/worker-codex/adapters/codex-quota-snapshot-observation-catalog.js": "b3693f1eda3323392982e4f4bf3430e92d91ec66ddfc110071c3569d7a33085d",
    "node_modules/@vioxen/agent-account-observability/dist/infrastructure/JsonRpcLineClient.js": "3c24d6f1c3e3e894bcf8e454e354394a746427d479026b51586703100f581105",
  })) assert.equal(sha256(await readFile(join(packageRoot, path))),
    wireFix && path.endsWith("/JsonRpcLineClient.js") ? provenance.changedPackageFiles[`package/${path}`].after : hash, path);
  const sourceRoot = join(tempRoot, "reviewed-source");
  await mkdir(sourceRoot);
  run("tar", ["-xzf", join(projectRoot, provenance.baseSource.path), "-C", sourceRoot]);
  const applied = spawnSync("git", ["apply", join(projectRoot, provenance.reviewedSourcePatch.path)], {
    cwd: sourceRoot, encoding: "utf8",
  });
  assert.equal(applied.status, 0, applied.stderr);
  const sourceInventory = (await fileInventory(sourceRoot, "source"))
    .map(([path, hash]) => [path.slice("source/".length), hash]);
  assert.equal(sourceInventory.length, provenance.reviewedSourceFiles);
  assert.equal(inventoryHash(sourceInventory), provenance.reviewedSourceInventorySha256);
  if (wireFix) {
    assert.equal(sha256(await readFile(join(projectRoot, provenance.quotaWirePatch.path))), provenance.quotaWirePatch.sha256);
    const appliedFix = spawnSync("git", ["apply", join(projectRoot, provenance.quotaWirePatch.path)], { cwd: sourceRoot, encoding: "utf8" });
    assert.equal(appliedFix.status, 0, appliedFix.stderr);
    const fixedInventory = (await fileInventory(sourceRoot, "source")).map(([path, hash]) => [path.slice(7), hash]);
    assert.equal(fixedInventory.length, provenance.fixedSourceFiles);
    assert.equal(inventoryHash(fixedInventory), provenance.fixedSourceInventorySha256);
    const parentRoot = join(tempRoot, "parent");
    await mkdir(parentRoot);
    const parentArchive = join(projectRoot, provenance.parentArchive.path);
    assert.equal(sha256(await readFile(parentArchive)), provenance.parentArchive.sha256);
    assert.equal(provenance.parentArchive.sha256, "338499bc01bc08958d53bcad6fdf0da9ab4dbc542705b947eed8eb59afdc49ae");
    run("tar", ["-xzf", parentArchive, "-C", parentRoot]);
    const parentInventory = await fileInventory(join(parentRoot, "package"), "package");
    assert.deepEqual(inventory.map(([path]) => path), parentInventory.map(([path]) => path));
    const current = new Map(inventory);
    const changed = Object.fromEntries(parentInventory.filter(([path, hash]) => current.get(path) !== hash)
      .map(([path, before]) => [path, { before, after: current.get(path) }]));
    assert.deepEqual(changed, provenance.changedPackageFiles);
    const stems = ["infrastructure/JsonRpcLineClient", "providers/codex/CodexAppServerQuotaReader", "providers/codex/codexTypes"];
    for (const path of Object.keys(changed)) {
      assert.ok(path === "package/package.json" || stems.some((stem) =>
        [".js", ".js.map", ".d.ts", ".d.ts.map"].some((ext) => path ===
          `package/node_modules/@vioxen/agent-account-observability/dist/${stem}${ext}`)), path);
    }
  }
  const hostManifest = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(projectRoot, "package-lock.json"), "utf8"));
  const dependency = "@vioxen/subscription-runtime";
  const pin = `file:vendor/vioxen-subscription-runtime-${version}.tgz`;
  assert.equal(hostManifest.dependencies[dependency], pin);
  assert.equal(lock.packages[""].dependencies[dependency], pin);
  const locked = lock.packages[`node_modules/${dependency}`];
  assert.equal(locked.version, manifest.version);
  assert.equal(locked.resolved, pin);
  assert.equal(locked.integrity, `sha512-${createHash("sha512").update(artifactBytes).digest("base64")}`);
  await verifyNativeQuota(packageRoot, { unitQuotaParams: wireFix });
  process.stdout.write(
    `subscription-runtime ${manifest.version} vendor artifact verified from ${provenance.sourceCommit ?? provenance.quotaWirePatch.sha256}\n`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status ?? "signal"}): ${result.stderr.trim()}`,
    );
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileInventory(root, prefix) {
  const entries = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) entries.push(...await fileInventory(path, name));
    else {
      assert.equal(entry.isFile(), true, `Unexpected non-file: ${name}`);
      entries.push([name, sha256(await readFile(path))]);
    }
  }
  return entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

function inventoryHash(entries) {
  return sha256(entries.map(([path, hash]) => `${path}\0${hash}\n`).join(""));
}
