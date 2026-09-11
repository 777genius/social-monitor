import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import test, { before, after } from "node:test";
import FakeTimers from "@sinonjs/fake-timers";
import { completed, deferred, fakeIo, legacyFixture, request, waitFor } from "./assessment-cli-test-support.mjs";
const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, compilerOptions: { rootDir: process.cwd() } });
require("tsconfig-paths/register");
const { SubscriptionRuntimeCliExecutor } = require("../src/subscription-runtime-cli-executor.ts");
const { assessmentRequest, syntheticInstallation } = require("../src/source-content-assessment-runtime.spec-support.ts");
const { createAssessmentProgressParser } = require("../src/subscription-runtime-cli-progress.ts");
let fixture;
before(async () => { fixture = await legacyFixture(); });
after(async () => { await fixture?.close(); });

// Execute the unmodified launcher source with only explicit fake filesystem/auth/executor imports.
// Its injected legacy function is the pinned actual entrypoint with fake IO and worker factory.
async function launch(t, { hold, neverStop = false, failedTask = false, parentLog = false, accountFailure = false } = {}) {
  const sources = new Map();
  for (const name of ["run-codex-subscription-runtime-agent-task.mjs", "assessment-cli-lifecycle.mjs", "assessment-cli-progress.mjs"]) {
    sources.set(name, await readFile(new URL(name, import.meta.url), "utf8"));
  }
  const pure = new Map();
  for (const name of ["codex-worker-cli-usage.mjs", "subscription-runtime-failure-details.mjs",
    "subscription-runtime-purpose-model-policy.mjs", "codex-auth-pool-routing.mjs"]) {
    pure.set(`./${name}`, await import(new URL(name, import.meta.url)));
  }
  const clock = FakeTimers.install({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  t.after(() => clock.uninstall());
  const events = [], records = [], gate = deferred(), turn = deferred(), stop = deferred();
  let input = JSON.stringify(request), options, aborts = 0, runCount = 0, disposeCount = 0, returned = false;
  const receive = createAssessmentProgressParser((record) => records.push(record));
  const io = fakeIo(fixture.root), logs = [];
  const parentChild = Object.assign(new EventEmitter(), {
    stdout: Object.assign(new EventEmitter(), { destroy() {} }),
    stderr: Object.assign(new EventEmitter(), { destroy() {} }),
    kill(signal) { fakeProcess.emit(signal); return true; }, unref() {},
  });
  const fakeProcess = Object.assign(new EventEmitter(), {
    argv: ["node", "/synthetic/launcher", "--provider", "codex", "--input", "/synthetic/request",
      "--format", "result-json", "--state-root", "/synthetic/state", "--encryption-key-env", "SYNTHETIC_LOCAL_KEY"],
    env: { SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS: "60000" },
    stderr: { write: (line) => { receive(Buffer.from(line)); parentChild.stderr.emit("data", Buffer.from(line)); return false; } },
  });
  const pause = async (phase) => { events.push(phase); if (hold === phase) await gate.promise; };
  class FakeExecutor {
    constructor(value) { options = value; events.push("executor-created"); }
    async run(job) {
      runCount++; options.observability.emit({ name: "provider.task.started", metadata: { prompt: "synthetic-private-content" } });
      job.abortSignal.addEventListener("abort", () => { aborts++; events.push("aborted"); });
      await turn.promise;
      options.observability.emit({ name: "provider.task.completed", metadata: { status: failedTask ? "failed" : "completed" } });
      return failedTask ? { status: "failed", attempts: [], reason: "task_timeout" } : { status: "completed", result: completed };
    }
    async dispose() {
      disposeCount++; events.push("pool-drain");
      await new Promise((resolve) => setTimeout(resolve, options.shutdownTimeoutMs));
      events.push("native-stop");
      if (neverStop) await stop.promise;
      else await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  const fs = {
    readFile: async (file) => { if (file === "/synthetic/request") { await pause("input-read"); return input; }
      if (file === "/synthetic/fail") throw new Error("Synthetic materialization failure");
      await pause("account-read"); return "synthetic-account-material"; },
    writeFile: async (file, bytes) => { if (file === "/synthetic/request") input = bytes; },
    mkdir: async () => {}, mkdtemp: async () => "/synthetic/materialization", realpath: async (p) => p,
    rm: async () => { await pause("auth-removal"); },
  };
  const namespaces = new Map([...pure, ["node:fs/promises", fs], ["node:path", path],
    ["./pinned-codex-native-binary.mjs", { resolvePinnedCodexBinaryPath: () => "/synthetic/not-executable" }],
    ["./codex-auth-pool-manifest.mjs", { loadCodexAuthPoolFromEnv: async () => {
      await pause("account-setup"); return { accounts: [{ id: "synthetic-account", authJsonPath: "/synthetic/account" },
        ...(accountFailure ? [{ id: "synthetic-failed", authJsonPath: "/synthetic/fail" }] : [])] };
    } }],
    ["@vioxen/subscription-runtime/worker-codex", { FileBackendCodexSafeExecutor: FakeExecutor,
      FileBackendCodexWorker: class { constructor() { throw new Error("Real/default worker forbidden"); } },
      NodeProcessRunner: class { constructor() { throw new Error("Native runner forbidden"); } } }],
    ["@vioxen/subscription-runtime/worker-core", { SubscriptionWorkerError: class extends Error {} }],
    ["../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js", {
      runSubscriptionAgentTaskCli: (argv, _io, factory) => {
        io.readStdin = async () => input;
        return fixture.runSubscriptionAgentTaskCli(argv.filter((arg, i) => arg !== "--input" && argv[i - 1] !== "--input"), io, factory);
      },
    }],
  ]);
  const context = createContext({ process: fakeProcess, performance: globalThis.performance, Date, AbortController, console,
    setTimeout, clearTimeout });
  const modules = new Map();
  async function load(specifier) {
    if (modules.has(specifier)) return modules.get(specifier);
    const name = specifier.replace(/^\.\//, "");
    let module;
    if (sources.has(name)) {
      module = new SourceTextModule(sources.get(name), { context,
        importModuleDynamically: async (specifier) => {
          const imported = await load(specifier); if (imported.status === "linked") await imported.evaluate(); return imported;
        } });
    } else {
      assert.ok(namespaces.has(specifier), `Unexpected import denied: ${specifier}`);
      const namespace = namespaces.get(specifier);
      module = new SyntheticModule(Object.keys(namespace), function () {
        for (const [key, value] of Object.entries(namespace)) this.setExport(key, value);
      }, { context });
    }
    modules.set(specifier, module); await module.link(load); return module;
  }
  let parentResult;
  if (parentLog) {
    let spawned = false;
    t.mock.method(require("node:child_process"), "spawn", () => { spawned = true; return parentChild; });
    const executor = new SubscriptionRuntimeCliExecutor({ command: "/synthetic/runtime-cli", ephemeral: false,
      installationInspector: { inspect: async () => ({ ...syntheticInstallation, packageRootRealpath: "/synthetic" }) },
      logger: { info: (message, fields) => logs.push({ message, fields }), warn() {}, error() {} },
    });
    parentResult = executor.execute({ ...assessmentRequest(), timeoutMs: 60_000 });
    await waitFor(() => spawned);
    assert.ok(spawned);
    const write = io.writeStdout;
    io.writeStdout = (line) => { write(line); parentChild.stdout.emit("data", Buffer.from(line)); };
  }
  const module = await load("./run-codex-subscription-runtime-agent-task.mjs");
  const result = module.evaluate().then(() => { returned = true; parentChild.emit("close", fakeProcess.exitCode, null); return fakeProcess.exitCode; });
  const until = async (predicate) => {
    await waitFor(predicate);
    assert.ok(predicate(), JSON.stringify({ events, stderr: io.stderr }));
  };
  return { clock, records, events, gate, turn, stop, result, until, io, fakeProcess,
    logs, parentResult, get options() { return options; }, get aborts() { return aborts; }, get runCount() { return runCount; },
    get disposeCount() { return disposeCount; }, get returned() { return returned; } };
}

test("actual launcher/legacy/fake executor forwards existing callbacks before close and reaches bounded native disposal", async (t) => {
  const h = await launch(t); await h.until(() => h.runCount === 1);
  assert.equal(h.returned, false);
  assert.ok(h.records.some((r) => r.phase === "provider.task" && r.transition === "started"));
  assert.equal(JSON.stringify(h.records).includes("synthetic-private-content"), false);
  assert.equal(h.options.shutdownTimeoutMs, 1000);
  assert.equal(h.options.effectMode, "read_only"); assert.equal(h.options.maxAccountCycles, 1);
  assert.equal(h.options.safeExecutionPolicy.maxAttempts, 1);
  for (const key of ["retryOnCapacity", "retryOnAccountUnavailable", "retryOnReconnectRequired", "retryUnknownCleanWorkspace"]) {
    assert.equal(h.options.safeExecutionPolicy[key], false);
  }
  assert.equal(h.options.accounts[0].worker.model, "gpt-5.6-sol");
  assert.equal(h.options.accounts[0].worker.reasoningEffort, "low");
  await h.clock.tickAsync(40_000); assert.equal(h.aborts, 1);
  await h.clock.tickAsync(5_000); assert.equal(h.disposeCount, 1);
  await h.clock.tickAsync(1_000); assert.ok(h.events.includes("native-stop"));
  await h.clock.tickAsync(10_000); assert.equal(await h.result, 1);
  // Drain 1s + stop 10s lands exactly on the 11s observation bound: no earlier receipt.
  assert.equal(h.records.at(-1).disposeSettled, false);
  assert.ok(h.records.every((r) => r.providerOutcome === "unknown"));
  h.turn.resolve(); await h.clock.tickAsync(0); assert.equal(h.disposeCount, 1);
});

for (const phase of ["input-read", "account-setup", "account-read"]) test(`launcher delayed ${phase} never reaches executor after cutoff`, async (t) => {
  const h = await launch(t, { hold: phase }); await h.until(() => h.events.includes(phase));
  await h.clock.tickAsync(45_000); assert.equal(await h.result, 1);
  h.gate.resolve(); await h.clock.tickAsync(0);
  assert.equal(h.runCount, 0); assert.equal(h.events.includes("executor-created"), false);
});

test("launcher holds auth cleanup in actual task settlement and never infers provider success", async (t) => {
  const h = await launch(t, { hold: "auth-removal", neverStop: true, failedTask: true });
  await h.until(() => h.runCount === 1); h.turn.resolve(); await h.clock.tickAsync(0);
  assert.ok(h.events.includes("auth-removal")); await h.clock.tickAsync(56_000);
  assert.equal(await h.result, 1);
  assert.ok(h.records.some((r) => r.phase === "task_settlement" && r.taskSettled === false));
  assert.equal(h.records.at(-1).disposeSettled, false);
  assert.ok(h.records.every((r) => r.providerOutcome === "unknown"));
  h.gate.resolve(); h.stop.resolve(); await h.clock.tickAsync(0);
});


test("actual existing callback reaches the parent executor logger while the fake engine is still held", async (t) => {
  const h = await launch(t, { parentLog: true }); await h.until(() => h.runCount === 1);
  assert.equal(h.returned, false);
  const log = h.logs.find(({ fields }) => fields.phase === "provider.task");
  assert.equal(log.message, "agent runtime assessment progress");
  assert.equal(log.fields.correlationId, assessmentRequest().correlationId);
  assert.equal(log.fields.requestId, assessmentRequest().requestId);
  assert.equal(JSON.stringify(h.logs).includes("synthetic-private-content"), false);
  await h.clock.tickAsync(40_000); h.turn.resolve(); await h.clock.tickAsync(11_000);
  assert.equal(await h.result, 1);
  const result = await h.parentResult;
  assert.equal(result.status, "failed"); assert.equal(result.failure.code, "agent_runtime.cli_timeout");
  assert.equal(result.failure.retryable, false); assert.equal(result.executionAttestation, undefined);
});


test("parallel account setup rejection does not hide another outstanding materialization", async (t) => {
  const h = await launch(t, { hold: "account-read", accountFailure: true });
  await h.until(() => h.events.includes("auth-removal"));
  assert.equal(h.returned, false);
  await h.clock.tickAsync(45_000); assert.equal(await h.result, 1);
  assert.ok(h.records.some((r) => r.phase === "task_settlement" && r.taskSettled === false));
  h.gate.resolve(); await h.clock.tickAsync(0);
  assert.equal(h.events.includes("executor-created"), false);
});
