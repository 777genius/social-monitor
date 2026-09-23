import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { verify, verifyArchive } from "./host-release.mjs";

const commit = "c045beb60f0b02ea8ae6b264036bef88ada20b76";
const helpers = [
  "run-codex-subscription-runtime-agent-task.mjs", "assessment-cli-progress.mjs",
  "assessment-cli-lifecycle.mjs", "pinned-codex-native-binary.mjs",
  "subscription-runtime-failure-details.mjs", "codex-worker-cli-usage.mjs",
  "codex-auth-pool-manifest.mjs", "codex-auth-pool-routing.mjs",
  "subscription-runtime-purpose-model-policy.mjs", "reader-promotion-v2-canary-contract.cjs",
];

async function put(root, relativePath, bytes) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return path;
}

function command(bin, args, options) {
  const result = spawnSync(bin, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `${bin} failed: ${result.stderr}`);
}

async function restoreWritableDirectories(dir) {
  if (!(await lstat(dir).catch(() => undefined))?.isDirectory()) return;
  await chmod(dir, 0o755);
  for (const name of await readdir(dir)) await restoreWritableDirectories(join(dir, name));
}

test("builds a deterministic, extractable host release from a disposable synthetic checkout", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "sm-host-archive-test-"));
  t.after(async () => {
    await restoreWritableDirectories(temp);
    await rm(temp, { recursive: true, force: true });
  });
  const source = join(temp, "synthetic-checkout");
  const output = join(temp, "output");
  const extracted = join(temp, "extracted");
  const fakeBin = join(temp, "fake-bin");
  await mkdir(fakeBin);
  await put(source, "package.json", '{"name":"synthetic-agent-runtime","version":"1.0.0"}');
  await put(source, "package-lock.json", "synthetic lock\n");
  for (const name of ["infinity-context-sdk-0.1.0.tgz", "vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz"]) {
    await put(source, `vendor/${name}`, "synthetic vendor archive\n");
  }
  await put(source, "dist/apps/agent-runtime/src/main.js", "export {};\n");
  await put(source, "dist/libs/contracts/generated/grpc/agent_runtime/v1/agent_runtime.js", "export {};\n");
  for (const name of helpers) {
    const target = join(source, "apps/agent-runtime/bin", name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(new URL(name, import.meta.url), target);
  }
  await copyFile(new URL("./host-release.mjs", import.meta.url), join(source, "apps/agent-runtime/bin/host-release.mjs"));
  const fakeGit = await put(fakeBin, "git", `#!/bin/sh\nif [ "$1" = "rev-parse" ]; then printf '%s\\n' '${commit}'; fi\n`);
  await chmod(fakeGit, 0o755);
  const fakeNpm = await put(fakeBin, "npm", `#!/usr/bin/env node
import { chmodSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
if (process.argv[2] === "run" && ["prisma:generate", "build"].includes(process.argv[3])) process.exit(0);
if (process.argv[2] !== "ci") process.exit(2);
mkdirSync("node_modules/@vioxen/subscription-runtime", { recursive: true });
writeFileSync("node_modules/@vioxen/subscription-runtime/package.json", JSON.stringify({ name: "@vioxen/subscription-runtime", version: "0.1.0-main.42-sm.3" }));
mkdirSync("node_modules/@vioxen/subscription-runtime/dist/worker-local", { recursive: true });
writeFileSync("node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js", "export {};\\n");
mkdirSync("node_modules/@openai/codex", { recursive: true });
writeFileSync("node_modules/@openai/codex/package.json", "{}");
mkdirSync("node_modules/@openai/codex-linux-${process.arch}", { recursive: true });
writeFileSync("node_modules/@openai/codex-linux-${process.arch}/package.json", "{}");
mkdirSync("node_modules/@openai/codex-linux-${process.arch}/vendor/${process.arch === "x64" ? "x86_64-unknown-linux-musl" : "aarch64-unknown-linux-musl"}/bin", { recursive: true });
writeFileSync("node_modules/@openai/codex-linux-${process.arch}/vendor/${process.arch === "x64" ? "x86_64-unknown-linux-musl" : "aarch64-unknown-linux-musl"}/bin/codex", "synthetic native binary");
chmodSync("node_modules/@openai/codex-linux-${process.arch}/vendor/${process.arch === "x64" ? "x86_64-unknown-linux-musl" : "aarch64-unknown-linux-musl"}/bin/codex", 0o755);
mkdirSync("node_modules/.bin", { recursive: true });
symlinkSync("../@vioxen/subscription-runtime/package.json", "node_modules/.bin/synthetic-runtime");
mkdirSync("node_modules/test", { recursive: true });
writeFileSync("node_modules/test/example.js", "excluded");
writeFileSync("node_modules/.env", "excluded");
writeFileSync("node_modules/synthetic.test.js", "excluded");
`);
  await chmod(fakeNpm, 0o755);
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` };
  const script = join(source, "apps/agent-runtime/bin/host-release.mjs");
  command(process.execPath, [script, "build", "--output-dir", output], { cwd: source, env });
  const archive = join(output, `agent-runtime-host-${commit}-linux-${process.arch}.tar.gz`);
  const manifestPath = `${archive}.json`;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const firstHash = createHash("sha256").update(await readFile(archive)).digest("hex");
  assert.equal(manifest.archiveSha256, firstHash);
  assert.equal(manifest.productCommit, commit);
  assert.equal(manifest.sourceCommit, commit);
  assert.deepEqual(manifest.target, { platform: "linux", arch: process.arch });
  command(process.execPath, [script, "build", "--output-dir", output], { cwd: source, env });
  assert.equal(createHash("sha256").update(await readFile(archive)).digest("hex"), firstHash);
  const args = ["--archive", archive, "--manifest", manifestPath,
    "--expect-product-commit", commit];
  await verifyArchive(args);
  await mkdir(extracted);
  command("tar", ["-xzf", archive, "-C", extracted], { cwd: source });
  await verify(["--release-dir", extracted, ...args,
    "--service-uid", String(process.getuid() + 1)]);
  if (process.getuid() > 0) {
    await assert.rejects(verify(["--release-dir", extracted, ...args,
      "--service-uid", String(process.getuid())]), /Release can be modified by service UID/);
  }
  assert.equal((await stat(join(extracted, "dist/apps/agent-runtime/src/main.js"))).isFile(), true);
  await assert.rejects(stat(join(extracted, "node_modules/test")), /ENOENT/);
  await assert.rejects(stat(join(extracted, "node_modules/.env")), /ENOENT/);
  await assert.rejects(stat(join(extracted, "node_modules/synthetic.test.js")), /ENOENT/);
});
