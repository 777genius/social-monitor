// Rebuild the MiMo package from its pinned public source and retained overlay.
// This verifies source/compiled/packed identities; it does not launch a worker.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const commit = "9af6583b34d46ca407e9c3bf0bfe4a84a93ad2c5";
const tree = "bdf12f57c59b4bb2ac73877d0feb8b65dc533723";
const version = "0.1.0-main.40-sm-mimo.10";
const sourceSha = "c9ea555fad9f9f1ed0802dee7b332eeeaff286f6f3d540e42578939fb424d946";
const sourceManifestSha = "282e23991ea96d44e34ca5589bd60e1cb49c16da366d19bedf021fa2bf924447";
const overlaySha = "9024cfb46013b6ee8d557d4bfb139e8328e637b5e71d169031f60ea2425b075c";
const overlayInventory = "c40c70c4e8cd56c0e28102a3778e95fcfdf1039c8f4f06ebfbaa3babb826559a";
const account = "@vioxen/agent-account-observability";
const vendor = join(root, "vendor");
const archive = join(vendor, `vioxen-subscription-runtime-${version}.tgz`);
const provenance = JSON.parse(await readFile(join(vendor, `vioxen-subscription-runtime-${version}.provenance.json`), "utf8"));
assert.equal(provenance.sourceRepository, "https://github.com/777genius/ar");
assert.equal(provenance.sourceCommit, commit); assert.equal(provenance.sourceTree, tree);
assert.equal(provenance.vendorVersion, version);
assert.match(provenance.archiveSha256, /^[0-9a-f]{64}$/u);
assert.equal(process.version, "v26.11.1", "Reproducibility uses the qualified Node toolchain");
const buildArchive = process.argv.includes("--build-archive");
const scratch = await mkdtemp(join(tmpdir(), "TEST-social-monitor-public-mimo-rebuild-"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  const sourceTar = join(vendor, "vioxen-subscription-runtime-ar-9af6583b.source.tar.gz");
  const sourceManifestPath = join(vendor, "vioxen-subscription-runtime-ar-9af6583b.source-manifest.json");
  assert.equal(sha(await readFile(sourceTar)), sourceSha);
  assert.equal(sha(await readFile(sourceManifestPath)), sourceManifestSha);
  const spec = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  assert.equal(spec.sourceRepository, provenance.sourceRepository);
  assert.equal(spec.sourceCommit, commit); assert.equal(spec.sourceTree, tree);
  assert.equal(spec.archiveSha256, sourceSha);
  const source = join(scratch, "source"), overlay = join(scratch, "overlay"), stage = join(scratch, "stage"), output = join(scratch, "packed");
  for (const path of [source, overlay, stage, output]) await mkdir(path);
  await extract(sourceTar, source);
  assert.deepEqual(await inventory(source), spec.files);
  for (const [name, mode] of Object.entries(spec.modes)) assert.equal((await lstat(join(source, name))).mode & 0o777, mode);
  assert.equal(sha(await readFile(join(source, "package-lock.json"))), spec.lockSha256);
  const oldArchive = join(vendor, "vioxen-subscription-runtime-0.1.0-main.40-sm-mimo.8.tgz");
  assert.equal(sha(await readFile(oldArchive)), overlaySha);
  await extract(oldArchive, overlay);
  const oldPackage = join(overlay, "package");
  assert.equal(digest(await inventory(oldPackage)), overlayInventory);
  const oldManifest = JSON.parse(await readFile(join(oldPackage, "package.json"), "utf8"));
  const env = await buildEnvironment(scratch);
  run("npm", ["ci", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund"], source, env);
  const lock = JSON.parse(await readFile(join(source, "package-lock.json"), "utf8"));
  for (const name of ["typescript", "vitest"]) {
    assert.equal(JSON.parse(await readFile(join(source, "node_modules", name, "package.json"), "utf8")).version,
      lock.packages[`node_modules/${name}`].version);
  }
  run("npm", ["run", "build"], source, env);
  for (const [name, pin] of Object.entries(spec.files)) assert.equal(sha(await readFile(join(source, name))), pin);
  for (const name of ["dist", "README.md", "LICENSE"]) await cp(join(source, name), join(stage, name), { recursive: true });
  const metadata = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  metadata.version = version; delete metadata.workspaces; delete metadata.scripts;
  metadata.dependencies = { ...oldManifest.dependencies };
  assert.deepEqual(new Set(Object.keys(metadata.dependencies)), new Set(metadata.bundledDependencies));
  const retained = {};
  for (const name of metadata.bundledDependencies) {
    const target = join(stage, "node_modules", name); await mkdir(dirname(target), { recursive: true });
    if (name === account) {
      await mkdir(target);
      await cp(join(source, "packages/agent-account-observability/dist"), join(target, "dist"), { recursive: true });
      await cp(join(source, "packages/agent-account-observability/package.json"), join(target, "package.json"));
    } else {
      const original = await inventory(join(oldPackage, "node_modules", name));
      await cp(join(oldPackage, "node_modules", name), target, { recursive: true });
      assert.deepEqual(await inventory(target), original); retained[name] = digest(original);
    }
    metadata.dependencies[name] = JSON.parse(await readFile(join(target, "package.json"), "utf8")).version;
  }
  assert.deepEqual(retained, provenance.retainedDependencyTreeHashes);
  metadata.socialMonitorSource = { repository: spec.sourceRepository, commit, tree,
    upstreamLockSha256: spec.lockSha256, dependencyOverlayArchiveSha256: overlaySha,
    retainedExternalDependencyTreeHashes: retained, accountObservabilityCompiledFromSamePublicSource: true };
  await writeFile(join(stage, "package.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  assert.equal(sha(await readFile(join(stage, "package.json"))), provenance.manifestSha256);
  assert.equal(digest(await inventory(join(stage, "dist"))), provenance.compiledDistSha256);
  assert.equal(digest(await inventory(stage)), provenance.installedDistributionSha256);
  const packed = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--offline", "--json", "--pack-destination", output], stage, env));
  assert.equal(packed.length, 1);
  const rebuilt = join(output, `vioxen-subscription-runtime-${version}.tgz`);
  assert.equal(sha(await readFile(rebuilt)), provenance.archiveSha256, "Public MiMo archive is not reproducible");
  if (buildArchive) await cp(rebuilt, archive);
  else assert.equal(sha(await readFile(archive)), provenance.archiveSha256);
  process.stdout.write(`MiMo runtime ${version} rebuilt from public ar ${commit}\n`);
} finally { await rm(scratch, { recursive: true, force: true }); }

async function inventory(base) {
  const files = {};
  async function walk(path, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === ".bin") continue;
      const name = prefix + entry.name, full = join(path, entry.name);
      assert.ok(!entry.isSymbolicLink(), "Source/package tree symlink is not admitted");
      if (entry.isDirectory()) await walk(full, name + "/");
      else { assert.ok(entry.isFile()); files[name] = sha(await readFile(full)); }
    }
  }
  await walk(base); return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function digest(files) { return sha(Buffer.from(Object.entries(files).map(([name, pin]) => `${name}\0${pin}\n`).join(""))); }
async function extract(path, destination) {
  const names = run("tar", ["-tzf", path]).trim().split("\n");
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.ok(name && !name.startsWith("/") && !name.split("/").includes(".."));
  run("tar", ["-xzf", path, "-C", destination]);
}
async function buildEnvironment(path) {
  const home = join(path, "home"), cache = join(path, "cache"), tmp = join(path, "tmp");
  for (const directory of [home, cache, tmp]) await mkdir(directory);
  const user = join(home, "user.npmrc"), global = join(home, "global.npmrc");
  await writeFile(user, ""); await writeFile(global, "");
  return { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, TMPDIR: tmp,
    NPM_CONFIG_CACHE: cache, NPM_CONFIG_USERCONFIG: user, NPM_CONFIG_GLOBALCONFIG: global,
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };
}
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n")); return result.stdout;
}
