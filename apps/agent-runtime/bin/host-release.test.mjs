import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertPinnedHelperClosure, treeHash, verify, verifyArchive } from "./host-release.mjs";

const commit = "c045beb60f0b02ea8ae6b264036bef88ada20b76";
const entry = "dist/apps/agent-runtime/src/main.js";
const cli = "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs";
const verifier = "apps/agent-runtime/bin/host-release.mjs";
const native = `node_modules/@openai/codex-linux-${process.arch}/vendor/${
  process.arch === "x64" ? "x86_64-unknown-linux-musl" : "aarch64-unknown-linux-musl"
}/bin/codex`;
const helpers = [
  "assessment-cli-progress.mjs", "assessment-cli-lifecycle.mjs",
  "pinned-codex-native-binary.mjs", "subscription-runtime-failure-details.mjs",
  "codex-worker-cli-usage.mjs", "codex-auth-pool-manifest.mjs",
  "codex-auth-pool-routing.mjs", "subscription-runtime-purpose-model-policy.mjs",
  "reader-promotion-v2-canary-contract.cjs",
];
const hash = (data) => createHash("sha256").update(data).digest("hex");

test("pinned helper list covers the real wrapper's local import closure", async () => {
  await assertPinnedHelperClosure(dirname(fileURLToPath(import.meta.url)));
});

async function put(root, path, content) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function fixture(t) {
  const temp = await realpath(await mkdtemp(join(dirname(fileURLToPath(import.meta.url)), ".sm-agent-host-test-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, "release");
  const archive = join(temp, "release.tar.gz");
  const manifestPath = join(temp, "release.json");
  await put(root, entry, "compiled");
  await put(root, cli, "wrapper");
  await put(root, verifier, "verifier");
  await chmod(join(root, cli), 0o755);
  for (const helper of helpers) await put(root, `apps/agent-runtime/bin/${helper}`, helper);
  await put(root, "package.json", "{}");
  await put(root, "package-lock.json", "lock");
  await put(root, "node_modules/@vioxen/subscription-runtime/package.json", JSON.stringify({
    name: "@vioxen/subscription-runtime", version: "0.1.0-main.42-sm.3",
  }));
  await put(root, "node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js", "vendored");
  await put(root, "node_modules/@openai/codex/package.json", "{}");
  await put(root, `node_modules/@openai/codex-linux-${process.arch}/package.json`, "{}");
  await put(root, native, "native");
  await chmod(join(root, native), 0o755);
  await writeFile(archive, "synthetic archive");
  const manifest = {
    schemaVersion: 1, sourceCommit: commit, productCommit: commit,
    target: { platform: process.platform, arch: process.arch }, entry, cli, verifier, helpers,
    helperSha256: Object.fromEntries(helpers.map((name) => [name, hash(name)])),
    archive: "release.tar.gz", archiveSha256: hash("synthetic archive"),
    wrapperSha256: hash("wrapper"), verifierSha256: hash("verifier"), lockfileSha256: hash("lock"),
    treeSha256: await treeHash(root),
  };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const args = ["--release-dir", root, "--manifest", manifestPath,
    "--archive", archive, "--expect-product-commit", commit,
    "--service-uid", String(process.getuid() + 1)];
  return { root, archive, manifestPath, manifest, args };
}

test("accepts a complete matching staged host release", async (t) => {
  const { args } = await fixture(t);
  await verifyArchive(args);
  await verify(args);
});

test("rejects a different product commit and archive SHA", async (t) => {
  const { archive, args } = await fixture(t);
  const otherCommit = [...args];
  otherCommit[otherCommit.indexOf("--expect-product-commit") + 1] = "f".repeat(40);
  await assert.rejects(verifyArchive(otherCommit), /Product commit mismatch/);
  await writeFile(archive, "tampered");
  await assert.rejects(verifyArchive(args), /Archive SHA-256 mismatch/);
});

test("rejects an archive built for another host architecture", async (t) => {
  const { manifest, manifestPath, args } = await fixture(t);
  manifest.target.arch = process.arch === "x64" ? "arm64" : "x64";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyArchive(args), /Host release target mismatch/);
});

test("rejects a missing helper and changed wrapper", async (t) => {
  const { root, args } = await fixture(t);
  await rm(join(root, "apps/agent-runtime/bin", helpers[0]));
  await assert.rejects(verify(args), /Missing regular release file/);
  await put(root, `apps/agent-runtime/bin/${helpers[0]}`, helpers[0]);
  await put(root, cli, "changed");
  await assert.rejects(verify(args), /Staged release bytes mismatch/);
});

test("rejects changed helper bytes and a non-executable CLI", async (t) => {
  const { root, args } = await fixture(t);
  await put(root, `apps/agent-runtime/bin/${helpers[0]}`, "changed");
  await assert.rejects(verify(args), /Helper SHA-256 mismatch/);
  await put(root, `apps/agent-runtime/bin/${helpers[0]}`, helpers[0]);
  await chmod(join(root, cli), 0o644);
  await assert.rejects(verify(args), /CLI is not executable/);
  await chmod(join(root, cli), 0o755);
  await chmod(join(root, native), 0o644);
  await assert.rejects(verify(args), /native binary is not executable/);
});

test("rejects a missing or modified packaged verifier", async (t) => {
  const { root, args } = await fixture(t);
  await rm(join(root, verifier));
  await assert.rejects(verify(args), /Missing regular release file/);
  await put(root, verifier, "changed verifier");
  await assert.rejects(verify(args), /Staged release bytes mismatch/);
});

test("rejects a symlink escaping the staged release", async (t) => {
  const { root, args } = await fixture(t);
  await symlink("/etc/passwd", join(root, "outside"));
  await assert.rejects(verify(args), /Symlink escapes release/);
});

test("rejects an environment file added after extraction", async (t) => {
  const { root, args } = await fixture(t);
  await put(root, ".env", "synthetic-only");
  await assert.rejects(verify(args), /Forbidden release path/);
});

test("rejects a staging root writable by the service group", async (t) => {
  const { root, args } = await fixture(t);
  await chmod(root, 0o775);
  await assert.rejects(verify(args), /Release can be modified by service UID/);
});

test("rejects a service-writable ancestor of an otherwise sealed release", async (t) => {
  const { root, args } = await fixture(t);
  const parent = dirname(root);
  await chmod(parent, 0o777);
  try {
    await assert.rejects(verify(args), /Release has writable ancestor/);
  } finally {
    await chmod(parent, 0o700);
  }
});
