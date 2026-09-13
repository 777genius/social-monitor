import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import test, { before, after } from "node:test";
import { request, completed } from "./assessment-cli-test-support.mjs";

let root, core, executorSource, recheckerSource;
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "assessment-capacity-fallback-"));
  const archive = path.resolve("vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.1.tgz");
  assert.equal(crypto.createHash("sha256").update(await readFile(archive)).digest("hex"),
    "66a8bdf6ae680bd3548fc92df140fb9df2202c829f946b9122393090faf9e31e");
  execFileSync("tar", ["-xzf", archive, "-C", root], { stdio: "pipe" });
  const load = (name) => import(pathToFileURL(path.join(root, "package/dist/worker-core", name)));
  core = Object.assign({}, ...await Promise.all([
    "errors.js", "worker-pool.js", "account-capacity/domain/index.js", "account-capacity/application/account-capacity-aware-worker.js",
    "safe-execution/application/safe-execution-runner.js", "safe-execution/domain/safe-execution-policy.js",
    "safe-execution/adapters/in-memory-attempt-journal.js", "safe-execution/adapters/in-memory-workspace-lock-store.js",
  ].map(load)));
  core.WorkerControlService = class { constructor() { throw new Error("Control service forbidden"); } };
  recheckerSource = await readFile(path.join(root, "package/dist/worker-codex/application/codex-account-capacity-rechecker.js"), "utf8");
  executorSource = await readFile(path.join(root, "package/dist/worker-codex/file-backend-codex-safe-executor.js"), "utf8");
});
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

// Actual launcher, pinned safe executor, journal, safe runner, pool and capacity
// wrapper and quota rechecker. Filesystem, account store, native observation
// and provider/CLI boundaries are fake; no native process can launch.
async function launch({ failures = ["preflight", "success"], mutateResult, abortAfterFailure = false } = {}) {
  const providerCalls = [], admissions = [], jobs = [], budgets = [], records = [];
  const blocked = new Set(), capacities = new Map(), rechecks = [];
  let pendingMode;
  let selectedFirst, result, failure, disposed = 0, input = JSON.stringify(request);
  const abort = new AbortController();
  const store = {
    read({ accountId }) { return capacities.get(accountId) ?? (blocked.has(accountId) ? { availability: "disabled", reason: "account_unavailable" } : null); },
    readState({ accountId }) {
      if (capacities.has(accountId)) return null;
      const index = admissions.length;
      admissions.push(accountId);
      selectedFirst ??= accountId;
      if (failures[index] === "preflight") blocked.add(accountId);
      if (failures[index]?.startsWith("native_snapshot_")) {
        pendingMode = failures[index];
        return { accountId, phase: core.WorkerAccountCapacityPhase.RecheckDue,
          capacity: { availability: "cooldown", reason: "quota_limited" } };
      }
      return null;
    },
    tryClaimRecheck({ state }) {
      return { status: core.WorkerAccountCapacityClaimStatus.Claimed,
        claim: { accountId: state.accountId, previous: state.capacity } };
    },
    resolveRecheck({ claim, resolution }) { capacities.set(claim.accountId, resolution.capacity); },
    observe() { return null; },
  };
  const journal = new core.InMemoryAttemptJournal();
  class FakeWorker {
    constructor(options) { this.options = options; this.workerId = options.workerId; this.state = "idle"; }
    async start() {}
    async seedCodexAuthJsonFile() {}
    capacity() { return { availability: "available", details: { accountId: this.options.capacityAccountId } }; }
    async run(job) {
      providerCalls.push(this.options.capacityAccountId); jobs.push(job);
      const mode = failures[admissions.length - 1];
      if (mode === "success") return completed;
      if (!["uncertain", "refresh-admission"].includes(mode)) this.options.observability.emit({ name: "provider.task.started" });
      const cause = new core.SubscriptionWorkerError("subscription_worker_account_unavailable", "Synthetic admission code");
      if (mode === "consumed-admission") throw cause;
      if (mode === "refresh-admission") {
        this.options.observability.emit({ name: "provider.refresh.started" });
        throw cause;
      }
      throw new core.SubscriptionWorkerError("subscription_worker_run_failed", "Synthetic provider failure", {
        cause: mode === "uncertain" ? cause : undefined,
        details: { reason: mode === "quota" ? "quota_limited" : "unknown_error" },
        ...(mode === "consumed" ? { usage: { totalTokens: 1 } } : {}),
      });
    }
    async dispose() { disposed++; }
  }
  const fs = {
    readFile: async (file) => file === "/synthetic/request" ? input : String(file),
    writeFile: async (file, bytes) => { if (file === "/synthetic/request") input = bytes; },
    mkdir: async () => {}, mkdtemp: async () => "/synthetic/materialized", realpath: async (p) => p, rm: async () => {},
  };
  const snapshot = { mode: "filesystem", workspacePath: "/synthetic/workspace", dirty: false,
    changedFiles: [], fingerprint: "clean", summary: "Synthetic clean workspace" };
  class Snapshotter { async capture() { return snapshot; } }
  class WorkspaceAccess { async canonicalizePath({ path }) { return path; } }
  class Runtime { createOwnerId() { return "synthetic-owner"; } currentPid() { return 1; } }
  const namespaces = new Map([
    ["node:fs/promises", fs], ["node:path", path], ["node:crypto", crypto],
    ["@vioxen/subscription-runtime/worker-core", core],
    ["@vioxen/subscription-runtime/provider-codex", { validateCodexAuthJsonBytes: ({ authJsonBytes }) => ({ parsed: { tokens: { account_id: authJsonBytes } } }) }],
    ["@vioxen/subscription-runtime/store-local-file", {
      LocalFileWorkerAccountCapacityStore: class { constructor() { return store; } },
      LocalFileWorkerControlInboxStore: class { constructor() { throw new Error("Control inbox forbidden"); } },
      createLocalFileSafeExecutionStores: () => ({ journal, lockStore: new core.InMemoryWorkspaceLockStore() }),
    }],
    ["../worker-local/safe-execution/index.js", { DefaultWorkspaceSnapshotter: Snapshotter,
      NodeSafeExecutionRuntime: Runtime, NodeSafeExecutionWorkspaceAccess: WorkspaceAccess }],
    ["./file-backend-codex-worker.js", { FileBackendCodexWorker: FakeWorker }],
    ["@vioxen/agent-account-observability", { AccountAvailability: { Available: "available" } }],
    ["./adapters/codex-quota-snapshot-observation.js", { CodexQuotaSnapshotObservation: class {
      async read() { rechecks.push(pendingMode); return { status: "rejected", reason: pendingMode }; }
    } }],
    ["./codex-live-quota-capacity.js", { codexLiveQuotaCapacitySnapshot: () => { throw new Error("Unexpected bound snapshot"); } }],
    ["./application/codex-account-capacity-alias-store.js", { CodexAccountCapacityAliasStore: class { constructor({ store }) { return store; } } }],
    ["./application/codex-live-quota-capacity.js", { recordCodexAppServerRateLimitsSnapshot: () => { throw new Error("Unexpected quota write"); } }],
    ["./pinned-codex-native-binary.mjs", { resolvePinnedCodexBinaryPath: () => "/synthetic/forbidden" }],
    ["./codex-auth-pool-manifest.mjs", { loadCodexAuthPoolFromEnv: async () => ({ accounts: failures.map((_, i) => ({ id: `synthetic-${i}`, authJsonPath: `/synthetic/account-${i}` })) }) }],
    ["../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js", {
      runSubscriptionAgentTaskCli: async (_argv, _io, factory) => {
        const worker = factory({ provider: "codex", stateRootDir: "/synthetic/state", env: {}, cwd: "/synthetic", encryptionKey: "synthetic" });
        try {
          await worker.start();
          result = await worker.run({ ...request.task, runId: request.runId, abortSignal: abort.signal });
          return 0;
        } catch (error) { failure = error; return 1; }
        finally { await worker.dispose(); }
      },
    }],
  ]);
  for (const name of ["codex-worker-cli-usage.mjs", "subscription-runtime-failure-details.mjs",
    "subscription-runtime-purpose-model-policy.mjs", "codex-auth-pool-routing.mjs"]) {
    namespaces.set(`./${name}`, await import(new URL(name, import.meta.url)));
  }
  const fakeProcess = Object.assign(new EventEmitter(), {
    argv: ["node", "/synthetic/launcher", "--provider", "codex", "--input", "/synthetic/request"], env: {},
    stderr: { write(line) { records.push(line); } },
  });
  const context = createContext({ process: fakeProcess, performance: globalThis.performance, Date, AbortController, setTimeout, clearTimeout, Buffer });
  const modules = new Map();
  async function load(specifier) {
    if (modules.has(specifier)) return modules.get(specifier);
    let module;
    if (specifier === "./application/codex-account-capacity-rechecker.js" || specifier === "executor" || ["./run-codex-subscription-runtime-agent-task.mjs", "./assessment-cli-lifecycle.mjs", "./assessment-cli-progress.mjs"].includes(specifier)) {
      const source = specifier === "./application/codex-account-capacity-rechecker.js" ? recheckerSource : specifier === "executor" ? executorSource : await readFile(new URL(specifier, import.meta.url), "utf8");
      module = new SourceTextModule(source, { context, importModuleDynamically: async (name) => {
        const loaded = await load(name); if (loaded.status === "linked") await loaded.evaluate(); return loaded;
      } });
    } else {
      assert.ok(namespaces.has(specifier), `Unexpected import forbidden: ${specifier}`);
      const namespace = namespaces.get(specifier);
      module = new SyntheticModule(Object.keys(namespace), function () {
        for (const [key, value] of Object.entries(namespace)) this.setExport(key, value);
      }, { context });
    }
    modules.set(specifier, module); await module.link(load); return module;
  }
  const executor = await load("executor"); await executor.evaluate();
  class ObservedExecutor extends executor.namespace.FileBackendCodexSafeExecutor {
    async run(job) {
      budgets.push(job.safeExecutionPolicy?.maxAttempts ?? 1);
      const value = await super.run(job);
      if (value.status !== "completed") {
        mutateResult?.(value, admissions);
        if (abortAfterFailure) abort.abort();
      }
      return value;
    }
  }
  namespaces.set("@vioxen/subscription-runtime/worker-codex", {
    FileBackendCodexSafeExecutor: ObservedExecutor, FileBackendCodexWorker: FakeWorker,
    NodeProcessRunner: class { constructor() { throw new Error("Native processes forbidden"); } },
  });
  const launcher = await load("./run-codex-subscription-runtime-agent-task.mjs"); await launcher.evaluate();
  return { result, failure, rechecks, capacities, providerCalls, admissions, jobs, budgets, disposed, selectedFirst, records,
    task: await journal.readTask({ taskId: request.runId }) };
}

test("first pre-provider unavailable account falls back through actual pool to another account", async () => {
  const h = await launch();
  assert.equal(h.failure, undefined);
  assert.equal(h.result.status, "completed");
  assert.equal(h.admissions.length, 2);
  assert.notEqual(h.admissions[0], h.admissions[1]);
  assert.deepEqual(h.providerCalls, [h.admissions[1]]);
  assert.deepEqual(h.budgets, [1, 2]);
  assert.equal(h.jobs[0].prompt, request.task.prompt);
  assert.equal(h.jobs[0].runId, request.runId);
  assert.deepEqual(h.task.attempts.map((a) => a.status), ["blocked", "completed"]);
  assert.equal(h.disposed, 2);
});

for (const mode of ["consumed", "uncertain", "quota", "consumed-admission", "refresh-admission"]) {
  test(`${mode} provider failure never retries even with an available account`, async () => {
    const h = await launch({ failures: [mode, "success"] });
    assert.ok(h.failure);
    assert.equal(h.providerCalls.length, 1);
    assert.equal(h.admissions.length, 1);
    assert.deepEqual(h.budgets, [1]);
    assert.equal(h.task.attempts.length, 1);
  });
}

test("pre-provider fallback stops immediately at a subsequent provider failure", async () => {
  const h = await launch({ failures: ["preflight", "consumed", "success"] });
  assert.ok(h.failure);
  assert.equal(h.providerCalls.length, 1);
  assert.deepEqual(h.budgets, [1, 2]);
});

test("all unavailable accounts are bounded to one admission each", async () => {
  const h = await launch({ failures: ["preflight", "preflight", "preflight"] });
  assert.ok(h.failure);
  assert.equal(h.providerCalls.length, 0);
  assert.equal(new Set(h.admissions).size, 3);
  assert.deepEqual(h.budgets, [1, 2, 3]);
});

for (const [name, mutateResult] of [
  ["generic capacity classification", (r) => { r.reason = "capacity_unavailable"; r.attempts[0].failureReason = "capacity_unavailable"; }],
  ["missing capacity provenance", (r) => { r.error.cause.details = undefined; }],
  ["unknown capacity reason", (r) => { r.error.cause.details.reason = "future_unknown"; }],
  ["inconclusive disabled capacity", (r) => { r.error.cause.details.reason = "quota_recheck_inconclusive"; }],
  ["missing typed admission evidence", (r) => { r.error = undefined; }],
  ["usage on admission error", (r) => { r.error.cause.usage = { totalTokens: 0 }; }],
  ["uncertain workspace", (r) => { r.attempts[0].workspaceDirtyAfter = true; }],
  ["provider usage on journal", (r) => { r.attempts[0].usage = { totalTokens: 1 }; }],
  ["unexpected previous attempt", (r) => { r.attempts.push({ status: "failed" }); }],
]) test(`${name} fails closed`, async () => {
  const h = await launch({ mutateResult });
  assert.ok(h.failure);
  assert.equal(h.providerCalls.length, 0);
  assert.deepEqual(h.budgets, [1]);
});

test("cancellation prevents capacity fallback", async () => {
  const h = await launch({ abortAfterFailure: true });
  assert.ok(h.failure);
  assert.equal(h.providerCalls.length, 0);
  assert.deepEqual(h.budgets, [1]);
});

for (const reason of ["native_snapshot_stop_unconfirmed", "native_snapshot_cleanup_failed",
  "native_snapshot_deadline", "native_snapshot_invalid", "native_snapshot_unsupported_demand"]) {
  test(`actual quota rechecker ${reason} blocks account fallback`, async () => {
    const h = await launch({ failures: [reason, "success"] });
    assert.ok(h.failure);
    assert.deepEqual(h.rechecks, [reason]);
    assert.equal([...h.capacities.values()][0].reason, "quota_recheck_inconclusive");
    assert.equal(h.admissions.length, 1);
    assert.equal(h.providerCalls.length, 0);
    assert.deepEqual(h.budgets, [1]);
    assert.equal(h.task.attempts.length, 1);
  });
}

function sessionRejection(result, admissions) {
  result.error = { code: "subscription_worker_pool_slot_failed" };
  result.attempts.at(-1).failureDetails = {
    reason: "provider_session_invalid", accountId: admissions.at(-1),
    subscriptionWorkerCode: "subscription_worker_pool_slot_failed", exitCode: "1",
  };
}

for (const [name, mutate, safe] of [
  ["literal production auth rejection", () => {}, true],
  ["numeric exit compatibility", (a) => { a.failureDetails.exitCode = 1; }, true],
  ["other serialized exit", (a) => { a.failureDetails.exitCode = "01"; }],
  ["missing reason", (a) => { delete a.failureDetails.reason; }],
  ["unknown reason", (a) => { a.failureDetails.reason = "unknown_error"; }],
  ["wrong account", (a) => { a.failureDetails.accountId = "not-configured"; }],
  ["missing exit", (a) => { delete a.failureDetails.exitCode; }],
  ["wrong code", (a) => { a.failureDetails.subscriptionWorkerCode = "unknown"; }],
  ["usage", (a) => { a.usage = { totalTokens: 0 }; }],
  ["output", (a) => { a.lastOutputSummary = ""; }],
  ["dirty before", (a) => { a.workspaceDirtyBefore = true; }],
  ["dirty after", (a) => { a.workspaceDirtyAfter = true; }],
  ["changed files", (a) => { a.changedFiles = ["synthetic"]; }],
]) test(`serialized session rejection: ${name}`, async () => {
  const h = await launch({ mutateResult(result, admissions) {
    sessionRejection(result, admissions);
    mutate(result.attempts.at(-1));
  } });
  assert.equal(h.failure === undefined, safe === true);
  assert.deepEqual(h.budgets, safe ? [1, 2] : [1]);
  assert.equal(h.providerCalls.length, safe ? 1 : 0);
});

for (const [name, contradict] of [
  ["outer usage", (error) => { error.usage = { totalTokens: 0 }; }],
  ["immediate cause usage", (error) => {
    error.cause = { code: "subscription_worker_account_unavailable", usage: { totalTokens: 0 } };
  }],
  ["outer provider/task failure", (error) => { error.code = "subscription_worker_run_failed"; }],
  ["immediate provider/task failure", (error) => {
    error.cause = { code: "subscription_worker_run_failed" };
  }],
  ["unknown outer reason", (error) => { error.code = "future_unknown"; }],
  ["unknown cause reason", (error) => { error.cause = { code: "future_unknown" }; }],
]) test(`serialized session rejection rejects contradictory ${name}`, async () => {
  const h = await launch({ mutateResult(result, admissions) {
    sessionRejection(result, admissions);
    contradict(result.error);
  } });
  assert.ok(h.failure);
  assert.deepEqual(h.budgets, [1]);
  assert.equal(h.providerCalls.length, 0);
});
