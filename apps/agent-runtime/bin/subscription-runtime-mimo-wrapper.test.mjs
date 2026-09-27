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
  canonicalRequest: { context: { purpose: "social_monitor.reader_summary.generate.v2" }, task: {
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
          return { status: "completed", result: { structuredOutput: { headline: "Synthetic" } } };
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
  assert.deepEqual(result, { structuredOutput: { headline: "Synthetic" } });
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

test("MiMo worker binds each daily purpose to its schema and output family", async () => {
  const cases = [
    ["social_monitor.reader_summary.generate.v2", "social_monitor_reader_summary_artifact", { headline: "Synthetic" }],
    ["social_monitor.reader_summary.repair.v2", "social_monitor_reader_summary_artifact", { headline: "Synthetic" }],
    ["social_monitor.reader_summary.topic_map.label.v2", "social_monitor_reader_summary_topic_map_labels", { nodeLabels: [] }],
    ["social_monitor.reader_summary.topic_map.verify_relations.v2", "social_monitor_reader_summary_topic_relations", { decisions: [] }],
    ["social_monitor.reader_summary.verify_story_relations.v2", "social_monitor_reader_summary_story_relations", { decisions: [] }],
    ["social_monitor.reader_summary.verify_related_topic_relations.v2", "social_monitor_reader_summary_related_topic_relations", { decisions: [] }],
  ];
  for (const [purpose, name, output] of cases) {
    let schemas;
    let workerOptions;
    let returnedOutput = output;
    const admission = { profile: { reasoningEffort: "high" }, canonicalRequest: {
      context: { purpose }, task: {
        outputSchemaName: name,
        controls: { outputSchemaName: name, outputSchema: { type: "object" } },
      },
    } };
    const dependencies = {
      admission,
      mimoRuntime: { createOneShotExecutor: (options) => {
        schemas = options.outputSchemas;
        workerOptions = options.accounts[0].worker;
        return { async run() { return { status: "completed", result: { structuredOutput: returnedOutput } }; },
          async dispose() {} };
      } },
      mimoApiKey: "synthetic-key",
      codexAuthPoolExecutionPolicy: {},
      codexAuthPoolTaskHash: () => "synthetic-hash",
      nonEmptyRunId: (id) => id,
      join, mkdir: async () => {},
      resolvePinnedCodexBinaryPath: () => "/synthetic/codex",
      subscriptionOnlyCodexEnvironment: () => ({}),
      SubscriptionWorkerError: class extends Error {
        constructor(code, message) { super(message); this.code = code; }
      },
    };
    const factory = new Function(
      ...Object.keys(dependencies), `${body}\nreturn createMimoSummaryWorker;`,
    )(...Object.values(dependencies));
    const input = { stateRootDir: "/synthetic/state", encryptionKey: "synthetic", env: {} };
    const worker = factory({ input, model: "mimo-v2.6-pro" });
    assert.deepEqual(await worker.run({ runId: "synthetic-run", prompt: "Synthetic." }),
      { structuredOutput: output }, purpose);
    assert.deepEqual(schemas, { [name]: { type: "object" } }, purpose);
    assert.equal(workerOptions.sourceEnv.MIMO_TOKEN_PLAN_API_KEY, "synthetic-key", purpose);
    assert.equal(workerOptions.modelBackend, "xiaomi-mimo-token-plan", purpose);
    assert.deepEqual(workerOptions.boundedWorkspaceTools,
      { allowedTools: [], denyProjectInstructions: true }, purpose);
    admission.canonicalRequest.task.outputSchemaName = "wrong";
    assert.throws(() => factory({ input, model: "mimo-v2.6-pro" }), /named output schema/u);
    admission.canonicalRequest.task.outputSchemaName = name;
    returnedOutput = { unrelated: true };
    const rejected = factory({ input, model: "mimo-v2.6-pro" });
    await assert.rejects(rejected.run({ runId: "synthetic-run" }), /output was rejected/u);
  }
});
