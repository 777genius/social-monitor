import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFile, chmod, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { verify, verifyArchive } from "./host-release.mjs";

const commit = "c045beb60f0b02ea8ae6b264036bef88ada20b76";
const helpers = [
  "run-codex-subscription-runtime-agent-task.mjs", "assessment-cli-progress.mjs",
  "assessment-cli-lifecycle.mjs", "mimo-app-server-custody.mjs", "installed-runtime-modules.mjs", "pinned-codex-native-binary.mjs",
  "mimo-key-file.mjs",
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

async function safeScratchParent(parent, serviceUid) {
  let childUid = process.getuid();
  for (let path = resolve(parent); ; path = dirname(path)) {
    const st = await lstat(path).catch(() => undefined);
    if (!st?.isDirectory() || await realpath(path).catch(() => undefined) !== path ||
        ![0, process.getuid()].includes(st.uid) || st.uid === serviceUid) {
      return false;
    }
    if ((st.mode & 0o022) !== 0 && ((st.mode & 0o1000) === 0 || childUid !== 0)) {
      return false;
    }
    if (path === dirname(path)) return true;
    childUid = st.uid;
  }
}

async function createScratch(serviceUid) {
  // A non-root user's new child under /tmp fails the release ancestor check.
  const checkout = await realpath(process.cwd());
  for (const parent of [homedir(), tmpdir()]) {
    if (resolve(parent) === checkout || resolve(parent).startsWith(`${checkout}/`)) continue;
    if (!(await safeScratchParent(parent, serviceUid))) continue;
    try {
      return await mkdtemp(join(parent, "sm-host-archive-test-"));
    } catch (error) {
      if (!["EACCES", "ENOENT", "EROFS"].includes(error.code)) throw error;
    }
  }
  throw new Error("No writable scratch parent satisfies the release ancestor policy");
}

test("builds a deterministic, extractable host release from a disposable synthetic checkout", {
  skip: process.platform !== "linux",
}, async (t) => {
  const temp = await createScratch(process.getuid() + 1);
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
  await put(source, "package-lock.json", JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "node_modules/json-schema-traverse": { version: "0.4.1", dev: true },
      "node_modules/dev-only": { version: "1.0.0", dev: true },
    },
  }));
  for (const name of ["infinity-context-sdk-0.1.0.tgz", "vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz", "vioxen-subscription-runtime-0.1.0-main.40-sm-mimo.5.tgz"]) {
    await put(source, `vendor/${name}`, "synthetic vendor archive\n");
  }
  const staleEntrypoint = "stale source dist entrypoint must never ship\n";
  await put(source, "dist/apps/agent-runtime/src/main.js", staleEntrypoint);
  await put(source, "dist/libs/stale.js", "stale source dist library must never ship\n");
  await put(source, "dist/apps/agent-runtime/stale.js", "stale source dist app must never ship\n");
  await cp(join(process.cwd(), "node_modules/json-schema-traverse"),
    join(source, "node_modules/json-schema-traverse"), { recursive: true });
  await put(source, "node_modules/dev-only/package.json", '{"name":"dev-only","version":"1.0.0"}');
  for (const name of helpers) {
    const target = join(source, "apps/agent-runtime/bin", name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(new URL(name, import.meta.url), target);
  }
  await copyFile(new URL("./host-release.mjs", import.meta.url), join(source, "apps/agent-runtime/bin/host-release.mjs"));
  const fakeGit = await put(fakeBin, "git", `#!/bin/sh\nif [ "$1" = "rev-parse" ]; then printf '%s\\n' '${commit}'; fi\n`);
  await chmod(fakeGit, 0o755);
  const fakeTsc = await put(source, "node_modules/.bin/tsc", `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
if (value("-p") !== "tsconfig.build.json" || !value("--outDir") || !value("--tsBuildInfoFile")) process.exit(2);
const out = value("--outDir");
for (const name of ["apps/agent-runtime/src/main.js", "libs/contracts/generated/grpc/agent_runtime/v1/agent_runtime.js"]) {
  mkdirSync(join(out, name, ".."), { recursive: true });
  writeFileSync(join(out, name), "fresh compiled bytes\\n");
}
writeFileSync(value("--tsBuildInfoFile"), "fresh incremental state\\n");
`);
  await chmod(fakeTsc, 0o755);
  const fakeAlias = await put(source, "node_modules/.bin/tsc-alias", `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[args.indexOf("-p") + 1] !== "tsconfig.build.json" || !args[args.indexOf("--outDir") + 1]) process.exit(2);
`);
  await chmod(fakeAlias, 0o755);
  const fakeNpm = await put(fakeBin, "npm", `#!/usr/bin/env node
import { chmodSync, cpSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
if (process.argv[2] === "run" && process.argv[3] === "prisma:generate") process.exit(0);
if (process.argv[2] !== "ci" || !process.argv.includes("--omit=dev") || process.argv.includes("--include=dev")) process.exit(2);
for (const name of [
  "@vioxen/subscription-runtime", "@vioxen/subscription-runtime-mimo",
  "@anthropic-ai/claude-agent-sdk", "@modelcontextprotocol/sdk", "ajv-formats",
  "zod", "zod-to-json-schema", "fast-uri", "fast-deep-equal",
]) {
  cpSync(process.env.SM_HOST_TEST_MODULES_ROOT + "/" + name, "node_modules/" + name, {
    recursive: true, verbatimSymlinks: true,
  });
}
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
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`,
    SM_HOST_TEST_MODULES_ROOT: join(process.cwd(), "node_modules") };
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
  const inspectorPath = join(temp, "compiled-inspector.mjs");
  await writeFile(inspectorPath, ts.transpileModule(
    await readFile(new URL("../src/subscription-runtime-installation.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText);
  const inspectorArgs = ["--input-type=module", "-e",
    'const { FileSubscriptionRuntimeInstallationInspector } = await import(process.argv[1]); ' +
      'await new FileSubscriptionRuntimeInstallationInspector().inspect(process.argv[2], "xiaomi-mimo-token-plan");',
    pathToFileURL(inspectorPath).href, join(extracted, "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs"),
  ];
  const inspect = spawnSync(process.execPath, inspectorArgs, { encoding: "utf8", cwd: source });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(JSON.parse(await readFile(join(extracted, "node_modules/json-schema-traverse/package.json"))).version, "0.4.1");
  assert.equal(JSON.parse(await readFile(join(extracted,
    "node_modules/@vioxen/subscription-runtime/node_modules/json-schema-traverse/package.json"))).version, "1.0.0");
  for (const path of [
    "node_modules/json-schema-traverse/spec/fixtures/schema.js",
    "node_modules/json-schema-traverse/spec/index.spec.js",
    "node_modules/@vioxen/subscription-runtime/node_modules/json-schema-traverse/spec/fixtures/schema.js",
    "node_modules/@vioxen/subscription-runtime-mimo/node_modules/@modelcontextprotocol/sdk/node_modules/json-schema-traverse/spec/index.spec.js",
    "node_modules/json-schema-traverse/LICENSE",
  ]) assert.equal((await stat(join(extracted, path))).isFile(), true, path);
  const approvedSpec = join(extracted, "node_modules/json-schema-traverse/spec/index.spec.js");
  const approvedSpecBytes = await readFile(approvedSpec);
  await appendFile(approvedSpec, "\n// altered after packaging\n");
  const changed = spawnSync(process.execPath, inspectorArgs, { encoding: "utf8", cwd: source });
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /Installed runtime import bytes are not approved: json-schema-traverse/);
  await writeFile(approvedSpec, approvedSpecBytes);
  if (process.getuid() > 0) {
    await assert.rejects(verify(["--release-dir", extracted, ...args,
      "--service-uid", String(process.getuid())]), /Release can be modified by service UID/);
  }
  assert.equal((await stat(join(extracted, "dist/apps/agent-runtime/src/main.js"))).isFile(), true);
  assert.equal(await readFile(join(extracted, "dist/apps/agent-runtime/src/main.js"), "utf8"), "fresh compiled bytes\n");
  assert.equal(await readFile(join(source, "dist/apps/agent-runtime/src/main.js"), "utf8"), staleEntrypoint);
  await assert.rejects(stat(join(extracted, "dist/apps/agent-runtime/stale.js")), /ENOENT/);
  await assert.rejects(stat(join(extracted, "dist/libs/stale.js")), /ENOENT/);
  await assert.rejects(stat(join(extracted, "node_modules/test")), /ENOENT/);
  await assert.rejects(stat(join(extracted, "node_modules/.env")), /ENOENT/);
  await assert.rejects(stat(join(extracted, "node_modules/synthetic.test.js")), /ENOENT/);
  await assert.rejects(stat(join(extracted, "node_modules/dev-only")), /ENOENT/);
});
