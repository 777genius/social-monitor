import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const source = await readFile(new URL(
  "./run-codex-subscription-runtime-agent-task.mjs", import.meta.url,
), "utf8");
const body = source.slice(
  source.indexOf("function createMimoSummaryWorker("),
  source.indexOf("function createReaderPromotionV2CanaryWorker("),
);
const summarySchemaName = "social_monitor_reader_summary_artifact";
const summarySchema = { type: "object", properties: { summary: { type: "string" } } };
const summaryAdmission = {
  profile: { reasoningEffort: "high" },
  canonicalRequest: { task: {
    outputSchemaName: summarySchemaName,
    controls: { outputSchemaName: summarySchemaName, outputSchema: summarySchema },
  } },
};

test("MiMo summary factory uses one isolated, tool-free backend attempt", async () => {
  const fakeKey = "synthetic-mimo-wrapper-key";
  let options;
  let runs = 0;
  const dependencies = {
    mimoRuntime: { createOneShotExecutor: (value) => {
      options = value;
      return {
        async run() {
          runs++;
          return { status: "completed", result: { structuredOutput: { ok: true } } };
        },
        async dispose() {},
      };
    } },
    mimoApiKey: fakeKey,
    admission: summaryAdmission,
    codexAuthPoolExecutionPolicy: { maxAttempts: 4 },
    codexAuthPoolTaskHash: () => "synthetic-task-hash",
    nonEmptyRunId: (id) => id,
    join,
    mkdir: async () => {},
    resolvePinnedCodexBinaryPath: () => "/synthetic/codex-not-executed",
    subscriptionOnlyCodexEnvironment: () => ({ PATH: "/synthetic/bin" }),
    SubscriptionWorkerError: class extends Error {
      constructor(code, message) { super(message); this.code = code; }
    },
  };
  const factory = new Function(
    ...Object.keys(dependencies), `${body}\nreturn createMimoSummaryWorker;`,
  )(...Object.values(dependencies));
  const worker = factory({ input: {
    stateRootDir: "/synthetic/state", encryptionKey: "synthetic-local-key",
    env: { OPENAI_API_KEY: "synthetic-ignored-openai-key" },
  }, model: "mimo-v2.6-pro" });
  const result = await worker.run({ runId: "synthetic-run", prompt: "Summarize." });
  assert.deepEqual(result, { structuredOutput: { ok: true } });
  assert.equal(runs, 1);
  assert.equal(options.accounts.length, 1);
  assert.equal(options.maxAccountCycles, 1);
  assert.equal(options.safeExecutionPolicy.maxAttempts, 1);
  assert.equal(options.safeExecutionPolicy.continuationMode, "disabled");
  assert.deepEqual(options.outputSchemas, { [summarySchemaName]: summarySchema });
  assert.equal(options.accounts[0].codexAuthJsonPath, undefined);
  assert.equal(options.accounts[0].worker.modelBackend, "xiaomi-mimo-token-plan");
  assert.equal(options.accounts[0].worker.model, "mimo-v2.6-pro");
  assert.equal(options.accounts[0].worker.executionEngine, "app-server-goal");
  assert.deepEqual(options.accounts[0].worker.boundedWorkspaceTools,
    { allowedTools: [], denyProjectInstructions: true });
  assert.deepEqual(options.accounts[0].worker.sourceEnv, {
    PATH: "/synthetic/bin", MIMO_TOKEN_PLAN_API_KEY: fakeKey,
  });
  await assert.rejects(worker.run({ runId: "synthetic-run" }), /accepts one task/u);
  await assert.rejects(worker.seedCodexAuthJsonFile("/synthetic/auth.json"), /rejects Codex auth/u);
  await worker.dispose();
});

test("MiMo summary factory rejects a synthetic key echoed by the model", async () => {
  const fakeKey = "synthetic-mimo-output-key";
  const dependencies = {
    mimoRuntime: { createOneShotExecutor: () => ({
      async run() { return { status: "completed", result: { outputText: fakeKey } }; },
      async dispose() { throw new Error(fakeKey); },
    }) },
    mimoApiKey: fakeKey,
    admission: summaryAdmission,
    codexAuthPoolExecutionPolicy: {},
    codexAuthPoolTaskHash: () => "synthetic-task-hash",
    nonEmptyRunId: (id) => id,
    join,
    mkdir: async () => {},
    resolvePinnedCodexBinaryPath: () => "/synthetic/codex-not-executed",
    subscriptionOnlyCodexEnvironment: () => ({}),
    SubscriptionWorkerError: class extends Error {
      constructor(code, message) { super(message); this.code = code; }
    },
  };
  const factory = new Function(
    ...Object.keys(dependencies), `${body}\nreturn createMimoSummaryWorker;`,
  )(...Object.values(dependencies));
  const worker = factory({
    input: { stateRootDir: "/synthetic/state", encryptionKey: "synthetic" },
    model: "mimo-v2.6-pro",
  });
  await assert.rejects(worker.run({ runId: "synthetic-run" }), (error) =>
    error.code === "subscription_worker_run_failed" &&
    !String(error).includes(fakeKey));
  await assert.rejects(worker.dispose(), (error) =>
    error.message === "MiMo reader summary cleanup failed" &&
    !String(error).includes(fakeKey));
});
