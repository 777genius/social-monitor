import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { URL } from "node:url";
import * as core from "@vioxen/subscription-runtime/worker-core";
import * as routing from "../bin/codex-auth-pool-routing.mjs";
import { createAssessmentCliLifecycle } from "../bin/assessment-cli-lifecycle.mjs";
import { createAssessmentProgress } from "../bin/assessment-cli-progress.mjs";
import { subscriptionRuntimeFailureDetails } from "../bin/subscription-runtime-failure-details.mjs";

// Actual wrapper function and native safe executor/pool, with inert worker and
// in-memory journal/locks/capacity. No CLI, provider, credentials or child launch.
const nativeUrl = new URL("../../../node_modules/@vioxen/subscription-runtime/dist/worker-codex/file-backend-codex-safe-executor.js", import.meta.url);
const nativeSource = await readFile(nativeUrl, "utf8");
const bridgeSource = await readFile(new URL("../bin/run-codex-subscription-runtime-agent-task.mjs", import.meta.url), "utf8");
const drain = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
const job = (runId) => ({ runId, prompt: `Synthetic input ${runId}`, controls: {}, metadata: {} });

// These extracted functions use the real lifecycle checkpoint/work methods.
// CLI deadline configuration is outside this extraction; isolate signal listeners
// from process and leave deadline/timer tests to the lifecycle suite.
function lifecycleFixture() {
  return createAssessmentCliLifecycle({ signals: new EventEmitter() });
}

async function fixture() {
  const lifecycle = lifecycleFixture();
  const receipts = [];
  const progress = createAssessmentProgress({
    write: (line) => receipts.push(line), now: () => 0, remaining: () => 60_000,
  });
  const attempts = [];
  const pending = new Map();
  const instances = [];
  const journal = new core.InMemoryAttemptJournal();
  const lockStore = new core.InMemoryWorkspaceLockStore();
  const capacityStore = new core.InMemoryWorkerAccountCapacityStore();
  class InertWorker {
    constructor(options) { this.workerId = options.workerId; this.accountId = options.capacityAccountId; }
    state = "ready";
    async start() {}
    async dispose() {}
    async seedCodexAuthJsonFile() {}
    capacity() { return { availability: "available", details: { accountId: this.accountId } }; }
    async run(input) {
      attempts.push({ id: input.runId, prompt: input.prompt, account: this.accountId });
      return new Promise((resolve, reject) => pending.set(input.runId, { resolve, reject }));
    }
  }
  const imports = {};
  for (const match of nativeSource.matchAll(/import\s+.*?\s+from\s+"([^"]+)";/gs)) {
    const specifier = match[1];
    imports[specifier] = specifier === "./file-backend-codex-worker.js"
      ? { FileBackendCodexWorker: InertWorker }
      : await import(specifier.startsWith(".") ? new URL(specifier, nativeUrl).href : specifier);
  }
  const compiled = nativeSource.replace(/import\s+\{(.*?)\}\s+from\s+"([^"]+)";/gs,
    (_, bindings, specifier) => `const {${bindings}} = imports[${JSON.stringify(specifier)}];`)
    .replaceAll("export ", "");
  const NativeExecutor = new Function("imports", `${compiled}\nreturn FileBackendCodexSafeExecutor;`)(imports);
  class SyntheticExecutor extends NativeExecutor {
    constructor(options) {
      super({ ...options, journal, lockStore, accountCapacityStore: capacityStore, shutdownTimeoutMs: 100,
        accounts: options.accounts.map(({ worker }) => ({ worker })),
        workspaceAccess: { canonicalizePath: async ({ path }) => path },
        snapshotter: { capture: async () => ({ dirty: false, changedFiles: [], fingerprint: "synthetic-clean" }) },
        runtime: { createOwnerId: () => "synthetic-owner", currentPid: () => undefined },
      });
      instances.push(this);
    }
  }
  const body = bridgeSource.slice(bridgeSource.indexOf("function createPooledCodexWorker("),
    bridgeSource.indexOf("async function createAuthMaterializationRoot("));
  const dependencies = { ...routing, lifecycle, progress, subscriptionRuntimeFailureDetails, join, mkdir: async () => {},
    createAuthMaterializationRoot: async () => "/synthetic/auth-materialization",
    materializeCodexAuthAccount: async () => "/synthetic/unused-auth",
    removeAuthMaterialization: async () => {},
    subscriptionOnlyCodexEnvironment: () => ({}), resolvePinnedCodexBinaryPath: () => "/synthetic/never-executed",
    isSourceContentAssessment: true,
    admission: { profile: { retryMode: "never", reasoningEffort: "high" } },
    FileBackendCodexSafeExecutor: SyntheticExecutor, SubscriptionWorkerError: core.SubscriptionWorkerError,
  };
  const create = new Function(...Object.keys(dependencies), `${body}\nreturn createPooledCodexWorker;`)(...Object.values(dependencies));
  const worker = () => create({ model: "gpt-5.6-sol", input: { stateRootDir: "/synthetic/state" },
    authPool: { accounts: [{ id: "synthetic-shared-account" }] } });
  const complete = (id) => pending.get(id).resolve({ status: "completed", structuredOutput: { request: id }, warnings: [] });
  return { worker, instances, attempts, pending, complete, journal, capacityStore, lifecycle, receipts };
}

test("independent wrapper invocations share one available account after observation loss without replaying A", async () => {
  const f = await fixture();
  const a = f.worker(), b = f.worker();
  try {
    const first = a.run(job("a"));
    const rejected = assert.rejects(first);
    await drain();
    assert.equal(f.attempts.length, 1);
    // Caller observation fails; this synthetic error makes no remote-stop claim.
    f.pending.get("a").reject(new Error("Synthetic accepted-turn observation loss"));
    await rejected;
    const second = b.run(job("b"));
    await drain();
    assert.equal(f.instances.length, 2);
    assert.deepEqual(f.attempts.map(({ id, account }) => ({ id, account })), [
      { id: "a", account: "synthetic-shared-account" },
      { id: "b", account: "synthetic-shared-account" },
    ]);
    assert.equal(f.instances[1].stats().inFlight, 1);
    f.complete("b");
    assert.deepEqual((await second).structuredOutput, { request: "b" });
    await assert.rejects(a.run(job("a")), /one task per CLI/);
    assert.equal(f.attempts.length, 2);
    assert.equal(await f.instances[0].options.controlInbox.consumeForContinuation({}), undefined);
    assert.equal(f.instances[0].options.safeExecutionPolicy.maxAttempts, 1);
  } finally { await Promise.all([a.dispose(), b.dispose()]); }
});

test("two independent native pools may run concurrently on the same available account", async () => {
  const f = await fixture();
  const a = f.worker(), b = f.worker();
  try {
    const first = a.run(job("parallel-a")), second = b.run(job("parallel-b"));
    await drain();
    assert.equal(f.instances.length, 2);
    assert.deepEqual(f.instances.map((instance) => instance.stats().inFlight), [1, 1]);
    assert.deepEqual(f.attempts.map(({ account }) => account), ["synthetic-shared-account", "synthetic-shared-account"]);
    f.complete("parallel-b");
    assert.deepEqual((await second).structuredOutput, { request: "parallel-b" });
    assert.equal(f.instances[0].stats().inFlight, 1);
    f.complete("parallel-a");
    assert.deepEqual((await first).structuredOutput, { request: "parallel-a" });
  } finally { await Promise.all([a.dispose(), b.dispose()]); }
});

test("native live workspace lock, recorded-attempt exhaustion and completed replay remain intact", async () => {
  const f = await fixture();
  const workers = Array.from({ length: 5 }, () => f.worker());
  try {
    const running = workers[0].run(job("same"));
    const rejected = assert.rejects(running);
    await drain();
    await assert.rejects(workers[1].run(job("same")));
    assert.equal(f.attempts.length, 1);
    f.pending.get("same").reject(new Error("Synthetic uncertain execution"));
    await rejected;
    await assert.rejects(workers[2].run(job("same")));
    assert.equal(f.attempts.length, 1);
    const success = workers[3].run(job("completed"));
    await drain();
    f.complete("completed");
    const result = await success;
    assert.deepEqual(await workers[4].run(job("completed")), result);
    assert.equal(f.attempts.length, 2);
  } finally { await Promise.all(workers.map((worker) => worker.dispose())); }
});

test("native capacity blocks unrelated work when account quota is unavailable", async () => {
  const f = await fixture();
  const worker = f.worker();
  f.capacityStore.observe({ accountId: "synthetic-shared-account", observedAt: new Date(),
    capacity: { availability: "quota_exhausted", reason: "quota_limited", cooldownUntil: new Date(Date.now() + 60_000) } });
  try {
    const controller = new globalThis.AbortController();
    const running = worker.run({ ...job("quota"), abortSignal: controller.signal });
    const rejected = assert.rejects(running);
    await drain();
    assert.equal(f.attempts.length, 0);
    controller.abort();
    await rejected;
    assert.equal(f.attempts.length, 0);
  } finally { await worker.dispose(); }
});

test("assessment rejects continuation before constructing the native executor", async () => {
  const f = await fixture();
  const worker = f.worker();
  await assert.rejects(worker.run({ ...job("continuation"), logicalThread: {} }), /rejects continuation/);
  assert.equal(f.instances.length, 0);
  assert.equal(f.attempts.length, 0);
});

test("actual native uncertainty forbids cross-engine fallback", async () => {
  const base = new URL("../provider-codex/app-server/", nativeUrl);
  const safety = await import(new URL("domain/app-server-execution-safety.js", base).href);
  const policy = await import(new URL("application/app-server-fallback-policy.js", base).href);
  const prestart = new Error("Synthetic prestart error");
  assert.equal(policy.appServerFallbackIsSafe(prestart), true);
  for (const error of [
    new safety.AppServerRequestMayHaveReachedProviderError(prestart, "turn/start"),
    new safety.AppServerExecutionMayHaveStartedError(prestart),
  ]) {
    assert.equal(safety.isAppServerExecutionReplayUnsafe(error), true);
    assert.equal(policy.appServerFallbackIsSafe(error), false);
  }
});

test("missing pool fails closed for assessment while ordinary worker selection stays compatible", () => {
  const body = bridgeSource.slice(bridgeSource.indexOf("const createStrictCodexWorker ="),
    bridgeSource.indexOf("function createReaderPromotionV2CanaryWorker("));
  let directStarts = 0;
  const dependencies = {
    lifecycle: lifecycleFixture(),
    admission: { profile: { provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high" } },
    authPool: undefined, isReaderPromotionV2Canary: false,
    FileBackendCodexWorker: class { constructor() { directStarts++; } },
    resolvePinnedCodexBinaryPath: () => "/synthetic/unused", subscriptionOnlyCodexEnvironment: () => ({}),
  };
  const create = new Function(...Object.keys(dependencies), "isSourceContentAssessment",
    `${body}\nreturn createStrictCodexWorker;`);
  assert.throws(() => create(...Object.values(dependencies), true)({ provider: "codex" }), /requires the configured Codex auth pool/);
  assert.equal(directStarts, 0);
  create(...Object.values(dependencies), false)({ provider: "codex" });
  assert.equal(directStarts, 1);
});

test("native completed cache is not an input, scope or untrimmed identity admission fence", async () => {
  const f = await fixture();
  const workers = Array.from({ length: 4 }, () => f.worker());
  try {
    const original = workers[0].run(job("cached"));
    await drain();
    f.complete("cached");
    const cached = await original;
    // Completed replay performs no inference, but cannot authorize changed input.
    // These deliberately unsupported caller identities are never promotion evidence.
    for (const [index, changed] of [
      { ...job("cached"), prompt: "Different synthetic input" },
      { ...job("cached"), metadata: { tenantId: "different-scope" } },
      job(" cached "),
    ].entries()) {
      assert.deepEqual(await workers[index + 1].run(changed), cached);
    }
    assert.equal(f.attempts.length, 1);
    assert.equal(f.attempts[0].prompt, "Synthetic input cached");
  } finally { await Promise.all(workers.map((worker) => worker.dispose())); }
});


test("extracted pool honors lifecycle cancellation before materialization or execution", async () => {
  const f = await fixture();
  const worker = f.worker();
  f.lifecycle.cancel();
  try {
    await assert.rejects(worker.run(job("cancelled")), /Assessment local work cancelled/);
    assert.equal(f.instances.length, 0);
    assert.equal(f.attempts.length, 0);
    assert.deepEqual(f.receipts, []);
  } finally { await worker.dispose(); }
});

test("extracted pool preserves native failure translation and cleanup receipts", async () => {
  const f = await fixture();
  const worker = f.worker();
  try {
    const running = worker.run(job("failed"));
    const rejected = assert.rejects(running, (error) => {
      assert.ok(error instanceof core.SubscriptionWorkerError);
      assert.equal(error.code, "subscription_worker_run_failed");
      return true;
    });
    await drain();
    assert.equal(f.attempts.length, 1);
    f.pending.get("failed").reject(new Error("Synthetic observation failure"));
    await rejected;
    assert.equal(f.attempts.length, 1);
    assert.ok(f.receipts.some((line) => line.includes('"phase":"account_materialization","transition":"completed"')));
    assert.ok(f.receipts.some((line) => line.includes('"phase":"auth_cleanup","transition":"completed"')));
  } finally { await worker.dispose(); }
});
