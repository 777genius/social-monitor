import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { trustedCodexWorkerResultToCli, withTrustedCodexWorkerUsage } from "./codex-worker-cli-usage.mjs";

const usage = { inputTokens: 12, outputTokens: 5, totalTokens: 17 };
test("trusted root maps exactly without mutating worker result or model data", () => {
  const model = { usage: { inputTokens: 999, outputTokens: 1, totalTokens: 1000 } };
  const original = { usage, structuredOutput: model, telemetry: { durationMs: 123 } };
  const result = trustedCodexWorkerResultToCli(original);
  assert.deepEqual(result.telemetry, { durationMs: 123, usage });
  assert.equal(original.telemetry.usage, undefined);
  assert.equal(result.structuredOutput, model);
  assert.equal(trustedCodexWorkerResultToCli({ structuredOutput: model, outputText: JSON.stringify(model) }).telemetry, undefined);
});
test("rejects malformed and conflicting metadata without guessing missing counts", () => {
  for (const invalid of [null, [], {}, { inputTokens: 1, outputTokens: 2 },
    { ...usage, totalTokens: 99 }, { ...usage, inputTokens: 1.5 },
    { ...usage, inputTokens: -1 }, { ...usage, inputTokens: Number.MAX_SAFE_INTEGER + 1 },
    { ...usage, outputTokens: "5" }, { ...usage, totalTokens: NaN }]) {
    assert.throws(() => trustedCodexWorkerResultToCli({ usage: invalid }), /Malformed/);
    assert.throws(() => trustedCodexWorkerResultToCli({ usage, telemetry: { usage: invalid } }), /Malformed/);
  }
  assert.throws(() => trustedCodexWorkerResultToCli({ usage,
    telemetry: { usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } } }), /Conflicting/);
  assert.deepEqual(trustedCodexWorkerResultToCli({ usage, telemetry: { usage } }).telemetry.usage, usage);
  const large = { inputTokens: Number.MAX_SAFE_INTEGER - 1, outputTokens: 1, totalTokens: Number.MAX_SAFE_INTEGER };
  assert.deepEqual(trustedCodexWorkerResultToCli({ usage: large }).telemetry.usage, large);
});
test("shared outer factory covers every selection and preserves single invocation and lifecycle", async () => {
  const source = await readFile(new URL("./run-codex-subscription-runtime-agent-task.mjs", import.meta.url), "utf8");
  assert.match(source, /const worker = withTrustedCodexWorkerUsage\(createStrictCodexWorker\(input\)\);/u);
  assert.match(source, /return isSourceContentAssessment \? lifecycle\.decorateWorker\(worker\) : worker;/u);
  for (const route of ["direct", "pooled", "strict"]) {
    const events = [];
    const worker = withTrustedCodexWorkerUsage({
      async start() { events.push("start"); },
      async seedCodexAuthJsonFile(value) { events.push(value); },
      async run(job) { events.push(job); return { usage }; },
      async dispose() { events.push("dispose"); },
    });
    await worker.start(); await worker.seedCodexAuthJsonFile("fake-path");
    assert.deepEqual((await worker.run(route)).telemetry.usage, usage);
    await worker.dispose();
    assert.deepEqual(events, ["start", "fake-path", route, "dispose"]);
  }
});

test("real CLI serialization and application parser preserve output and unknown or trusted usage", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  require("ts-node").register({ transpileOnly: true, compilerOptions: { rootDir: process.cwd() } });
  require("tsconfig-paths/register");
  const { parseSubscriptionRuntimeCliResult } = require("../src/subscription-runtime-cli-support.ts");
  const { runSubscriptionAgentTaskCli } = await import("../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js");
  for (const [mapped, metadata, expectedUsage] of [
    [false, { usage }, undefined],
    [true, { usage }, usage],
    [true, {}, undefined],
    [true, { usage, telemetry: { usage: { ...usage } } }, usage],
    [true, { usage: null }, undefined],
    [true, { telemetry: { usage: {} } }, undefined],
    [true, { usage, telemetry: { usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } } }, undefined],
  ]) {
    let stdout = "";
    let runs = 0;
    const worker = {
      async start() {}, async dispose() {},
      async run() { runs++; return { outputText: "fake", warnings: [], ...metadata }; },
    };
    const code = await runSubscriptionAgentTaskCli(
      ["--provider", "codex", "--ephemeral", "--format", "result-json"],
      {
        readStdin: async () => JSON.stringify({ protocolVersion: 1,
          runId: "fake-usage-contract", task: { kind: "structured-prompt", prompt: "fake", systemPrompt: "fake" } }),
        cwd: () => process.cwd(), env: () => ({}),
        writeStdout: (chunk) => { stdout += chunk; }, writeStderr() {},
      },
      () => mapped ? withTrustedCodexWorkerUsage(worker) : worker,
    );
    assert.equal(code, 0, stdout);
    assert.equal(runs, 1);
    const parsed = parseSubscriptionRuntimeCliResult(stdout);
    assert.equal(parsed.status, "completed");
    assert.equal(parsed.outputText, "fake");
    assert.deepEqual(parsed.usage,
      expectedUsage ? { ...expectedUsage, estimatedCostUsd: 0 } : undefined);
    if (mapped && expectedUsage === undefined) {
      const serialized = JSON.parse(stdout);
      assert.equal(Object.hasOwn(serialized, "usage"), false);
      assert.equal(Object.hasOwn(serialized.telemetry ?? {}, "usage"), false);
    }
  }
});
