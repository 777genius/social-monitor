import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePinnedCodexBinaryPath } from "./pinned-codex-native-binary.mjs";
import { resolve as resolveProbe } from "../../../ops/deploy/support/reader-promotion-v2-canary-probe-loader.mjs";

const appRequire = createRequire(new URL("../../../package.json", import.meta.url));
const targets = { x64: "x86_64-unknown-linux-musl", arm64: "aarch64-unknown-linux-musl" };

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "sm-pinned-native-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appPackageJson = path.join(root, "package.json");
  await writeFile(appPackageJson, '{}');
  const codexRoot = path.join(root, "node_modules/@openai/codex");
  await mkdir(codexRoot, { recursive: true });
  await writeFile(path.join(codexRoot, "package.json"), JSON.stringify({
    name: "@openai/codex", version: "0.147.0", bin: { codex: "bin/codex.js" },
  }));
  return { root, appPackageJson, codexRoot };
}

for (const [arch, target] of Object.entries(targets)) {
  test(`resolves the app Codex optional Linux ${arch} package, including nested npm layout`, async (t) => {
    const f = await fixture(t);
    const nativeRoot = path.join(f.codexRoot, "node_modules/@openai", `codex-linux-${arch}`);
    await mkdir(nativeRoot, { recursive: true });
    await writeFile(path.join(nativeRoot, "package.json"), JSON.stringify({
      name: "@openai/codex", version: `0.147.0-linux-${arch}`, os: ["linux"], cpu: [arch],
    }));
    const binary = resolvePinnedCodexBinaryPath({ ...f, platform: "linux", arch });
    assert.equal(binary, path.join(nativeRoot, "vendor", target, "bin/codex"));
    assert.ok(path.isAbsolute(binary));
    // A final symlink must remain visible to the adapter's NOFOLLOW check.
    await mkdir(path.dirname(binary), { recursive: true });
    await symlink("/synthetic/never-executed", binary);
    assert.equal(resolvePinnedCodexBinaryPath({ ...f, platform: "linux", arch }), binary);
    assert.ok(fs.lstatSync(binary).isSymbolicLink());
  });
}

test("missing optional package fails without using a cwd, PATH, or legacy shim fallback", async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, "node_modules/.bin"), { recursive: true });
  await writeFile(path.join(f.root, "node_modules/.bin/codex"), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  assert.throws(() => resolvePinnedCodexBinaryPath({ ...f, platform: "linux", arch: "x64" }),
    { code: "MODULE_NOT_FOUND" });
  for (const [platform, arch] of [["darwin", "x64"], ["win32", "x64"], ["linux", "riscv64"]]) {
    assert.throws(() => resolvePinnedCodexBinaryPath({ ...f, platform, arch }), /requires Linux x64 or arm64/);
  }
});

test("installed pinned JS shim selects the same executable and forwards arguments, exits and signals", async () => {
  const manifestPath = appRequire.resolve("@openai/codex/package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.version, "0.147.0");
  const nativeManifest = JSON.parse(await readFile(createRequire(manifestPath)
    .resolve(`@openai/codex-linux-${process.arch}/package.json`), "utf8"));
  assert.equal(manifest.optionalDependencies[`@openai/codex-linux-${process.arch}`],
    `npm:@openai/codex@${nativeManifest.version}`);
  assert.deepEqual(nativeManifest.os, ["linux"]);
  assert.deepEqual(nativeManifest.cpu, [process.arch]);
  const shimPath = path.join(path.dirname(manifestPath), manifest.bin.codex);
  const source = (await readFile(shimPath, "utf8"))
    .replace(/^#!.*\n/, "")
    .replace(/^import .*;\n/gm, "")
    .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(shimPath).href));
  const evaluate = new Function("spawn", "existsSync", "realpathSync", "createRequire", "path", "fileURLToPath", "process",
    `return (async () => {${source}\n})();`);
  for (const signal of [null, "SIGTERM"]) {
    let invocation;
    let exitCode;
    const handlers = new Map();
    const signals = [];
    const child = new EventEmitter();
    child.kill = (value) => signals.push(value);
    const argv = ["app-server", "--stdio", "-c", 'synthetic="two words"'];
    await evaluate((command, args, options) => {
      invocation = { command, args, options };
      globalThis.queueMicrotask(() => {
        for (const handler of handlers.values()) handler();
        child.emit("exit", signal ? null : 17, signal);
      });
      return child;
    }, fs.existsSync, fs.realpathSync, createRequire, path, fileURLToPath, {
      platform: process.platform, arch: process.arch, argv: [process.execPath, shimPath, ...argv],
      env: { PATH: "/synthetic/path", LANG: "C.UTF-8" }, pid: 42,
      on: (name, handler) => handlers.set(name, handler),
      exit: (code) => { exitCode = code; }, kill: (pid, value) => { assert.equal(pid, 42); signals.push(value); },
    });
    assert.equal(invocation.command, resolvePinnedCodexBinaryPath());
    assert.deepEqual(invocation.args, argv);
    assert.equal(invocation.options.stdio, "inherit");
    assert.equal(invocation.options.cwd, undefined);
    assert.deepEqual(invocation.options.env, {
      PATH: "/synthetic/path", LANG: "C.UTF-8", CODEX_MANAGED_BY_NPM: "1",
      CODEX_MANAGED_PACKAGE_ROOT: fs.realpathSync(path.dirname(manifestPath)),
    });
    assert.equal(exitCode, signal ? undefined : 17);
    assert.deepEqual(signals, ["SIGINT", "SIGTERM", "SIGHUP", ...(signal ? [signal] : [])]);
  }
});

test("canary probe admits a regular executable ELF and rejects shims, symlinks and non-executables", async (t) => {
  const f = await fixture(t);
  const binary = path.join(f.root, "native-codex");
  // Real Linux ELF fixture, copied but never executed; no Codex/provider launch.
  await copyFile("/usr/bin/true", binary);
  const probe = await resolveProbe("@vioxen/subscription-runtime/worker-codex", {}, () => { throw new Error("unexpected import"); });
  const source = decodeURIComponent(probe.url.slice("data:text/javascript,".length))
    .replace(/^\s*import .*;\n/gm, "").replaceAll("export ", "");
  const dependencies = { assert, Buffer, process: { platform: "linux", arch: "x64" },
    ...Object.fromEntries(["accessSync", "openSync"].map((name) => [name, (_path, flags) => fs[name](binary, flags)])),
    ...Object.fromEntries(["closeSync", "constants", "fstatSync", "readSync"].map((name) => [name, fs[name]])),
  };
  const Worker = new Function(...Object.keys(dependencies), `${source}\nreturn FileBackendCodexWorker;`)(...Object.values(dependencies));
  const input = {
    codexBinaryPath: "/app/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex",
    model: "gpt-5.6-sol", reasoningEffort: "high", executionEngine: "packaged-exec", refreshConflictRetryMaxMs: 0,
  };
  assert.equal(new Worker(input).offlineFactoryProbe, true);
  assert.throws(() => new Worker({ ...input, codexBinaryPath: "/app/node_modules/.bin/codex" }));
  fs.chmodSync(binary, 0o600);
  assert.throws(() => new Worker(input), { code: "EACCES" });
  fs.chmodSync(binary, 0o755);
  await writeFile(binary, '#!/usr/bin/env node\nthrow new Error("must not run");\n');
  assert.throws(() => new Worker(input), { code: "ERR_ASSERTION" });
  await rm(binary);
  await symlink("/usr/bin/true", binary);
  assert.throws(() => new Worker(input), { code: "ELOOP" });
});

test("every wrapper factory uses the native default and preserves explicit synthetic overrides lazily", async () => {
  const source = await readFile(new URL("./run-codex-subscription-runtime-agent-task.mjs", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("const createStrictCodexWorker ="),
    source.indexOf("async function createAuthMaterializationRoot("));
  for (const lane of ["single", "single-canary", "pool", "pool-canary", "assessment"]) {
    for (const override of [undefined, "/synthetic/fake-codex.mjs"]) {
      const captured = [];
      const isPool = lane.startsWith("pool") || lane === "assessment";
      const dependencies = {
        admission: { profile: { provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", retryMode: "never" },
          canonicalRequest: { runId: "synthetic-native-contract" } },
        authPool: isPool ? { accounts: [{ id: "fixture-account" }] } : undefined,
        isSourceContentAssessment: lane === "assessment",
        isReaderPromotionV2Canary: lane.endsWith("canary"), assessmentOutputSchemas: undefined,
        resolvePinnedCodexBinaryPath: () => {
          assert.equal(override, undefined, "explicit override must not resolve a production package");
          return resolvePinnedCodexBinaryPath();
        },
        FileBackendCodexWorker: class { constructor(options) { captured.push(options); } },
        FileBackendCodexSafeExecutor: class {
          constructor(options) { captured.push(...options.accounts.map(({ worker }) => worker)); }
          async run() { return { status: "completed", result: {} }; }
        },
        NodeProcessRunner: class { capabilities = {}; },
        subscriptionOnlyCodexEnvironment: (env) => env,
        nonEmptyRunId: (id) => id,
        orderCodexAuthAccountsForTask: (accounts) => accounts,
        codexAuthPoolTaskHash: () => "synthetic-hash", codexAuthPoolExecutionPolicy: {},
        join: path.join, mkdir: async () => {},
        createAuthMaterializationRoot: async () => "/synthetic/materialization",
        materializeCodexAuthAccount: async () => "/synthetic/unused-auth",
        removeAuthMaterialization: async () => {},
        readerPromotionV2CanarySchemaName: "synthetic-schema", readerPromotionV2CanaryOutputSchema: {},
      };
      const create = new Function(...Object.keys(dependencies), `${body}\nreturn createStrictCodexWorker;`)(...Object.values(dependencies));
      const env = { LANG: "C.UTF-8" };
      const worker = create({ provider: "codex", stateRootDir: "/synthetic/state", cwd: "/synthetic/task",
        codexBinaryPath: override, env });
      if (isPool && !lane.endsWith("canary")) await worker.run({ runId: "synthetic-native-contract" });
      assert.equal(captured.length, 1, lane);
      assert.equal(captured[0].codexBinaryPath, override ?? resolvePinnedCodexBinaryPath(), lane);
      assert.equal(captured[0].sourceEnv, env, lane);
      assert.equal(captured[0].model, "gpt-5.6-sol", lane);
      assert.equal(captured[0].reasoningEffort, "high", lane);
    }
  }
});
