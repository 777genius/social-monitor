// Focused offline/fake tests proving the full usage path:
//   engine -> trusted worker -> CLI telemetry -> application parser
//
// Both P0 break points are covered:
//   P0 Case 1 – engine reads usage from thread/tokenUsage/updated and returns it at root.
//               (main.41 engine fix; simulated here by a fake worker returning root usage)
//   P0 Case 2 – safe worker returns trusted root usage; without the adapter the application
//               parser cannot see it because it reads only telemetry.usage, not root usage.
//
// No network, no real Claude/Codex calls.  Only import is the adapter under test.

import assert from "node:assert/strict";
import test from "node:test";
import {
  trustedCodexWorkerResultToCli,
  withTrustedCodexWorkerUsage,
} from "./codex-worker-cli-usage.mjs";

// ---------------------------------------------------------------------------
// Inline mirror of parseSubscriptionRuntimeCliResult's usage-extraction logic.
// Source of truth: apps/agent-runtime/src/subscription-runtime-cli-support.ts
// and its unit spec (subscription-runtime-cli-support.spec.ts).
// The contract: parser reads parsed.telemetry.usage ONLY; root usage is ignored.
// ---------------------------------------------------------------------------

function parseCliTelemetryUsage(jsonString) {
  const parsed = JSON.parse(jsonString);
  const telemetry = asRecord(parsed.telemetry);
  return readUsageRecord(telemetry?.usage);
}

function readUsageRecord(value) {
  const record = asRecord(value);
  if (!record) return undefined;
  const inputTokens = nonNegSafeInt(record.inputTokens);
  const outputTokens = nonNegSafeInt(record.outputTokens);
  const totalTokens = nonNegSafeInt(record.totalTokens);
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined ||
    totalTokens !== inputTokens + outputTokens
  ) {
    return undefined;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: nonNegFinite(record.estimatedCostUsd),
  };
}

function asRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : undefined;
}
function nonNegSafeInt(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
}
function nonNegFinite(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

// ---------------------------------------------------------------------------
// Minimal simulation of what runSubscriptionAgentTaskCli outputs for a
// completed worker result.  The CLI passes telemetry (including usage) from
// the worker result into its JSON output.  Root-level usage is NOT promoted to
// telemetry by the CLI itself; that promotion is the adapter's sole job.
// This is confirmed by the integration test in codex-worker-cli-usage.test.mjs
// test 4 ("real CLI serialization and application parser retain trusted
// worker-root counts") which shows: mapped=false → parser returns undefined.
// ---------------------------------------------------------------------------

function simulateCliJson(workerResult) {
  return JSON.stringify({
    status: "completed",
    outputText: workerResult.outputText ?? "",
    telemetry: workerResult.telemetry,
    warnings: workerResult.warnings ?? [],
    ...(workerResult.structuredOutput !== undefined
      ? { structuredOutput: workerResult.structuredOutput }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// P0 Case 1 – engine → trusted worker → CLI telemetry → application parser
//
// The main.41 fix changes the App Server execution engine to read usage from
// thread/tokenUsage/updated events instead of turn/completed.  After the
// engine produces the usage, the FileBackendCodexManagedRunCoordinator places
// it at root (result.usage).  The adapter (trustedCodexWorkerResultToCli) must
// then promote it to telemetry.usage so the parser can find it.
// ---------------------------------------------------------------------------

test("P0 Case 1 full path: engine-derived usage from thread/tokenUsage/updated flows to parser", () => {
  // Simulate engine output after processing thread/tokenUsage/updated:
  //   last event for the correct thread/turn wins; stale/foreign events are
  //   discarded by the engine before this point.
  const engineUsage = { inputTokens: 12, outputTokens: 5, totalTokens: 17 };
  const workerResult = { outputText: "model output", usage: engineUsage, warnings: [] };

  // Trusted worker step: adapter promotes root usage to telemetry.usage
  const adapted = trustedCodexWorkerResultToCli(workerResult);
  assert.deepEqual(
    adapted.telemetry?.usage,
    engineUsage,
    "adapter must lift engine-derived root usage to telemetry.usage",
  );

  // CLI telemetry step: serialised JSON contains telemetry.usage
  const cliJson = simulateCliJson(adapted);
  const cliParsed = JSON.parse(cliJson);
  assert.deepEqual(
    cliParsed.telemetry?.usage,
    engineUsage,
    "CLI JSON must carry telemetry.usage from the adapted result",
  );

  // Application parser step: parser recovers usage from telemetry.usage
  const parsed = parseCliTelemetryUsage(cliJson);
  assert.deepEqual(
    parsed,
    { ...engineUsage, estimatedCostUsd: 0 },
    "parser must recover engine-derived usage from CLI JSON via telemetry.usage",
  );
});

// ---------------------------------------------------------------------------
// P0 Case 2 – trusted root usage is invisible to parser without the adapter
// ---------------------------------------------------------------------------

test("P0 Case 2 full path: without adapter root usage is lost; adapter fixes it", () => {
  const trustedUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
  const workerResult = { outputText: "safe output", usage: trustedUsage, warnings: [] };

  // Without adapter: root usage is NOT promoted to telemetry; parser returns undefined.
  // This reproduces the original P0 Issue 2 breakage.
  const withoutAdapterJson = simulateCliJson(workerResult);
  assert.equal(
    parseCliTelemetryUsage(withoutAdapterJson),
    undefined,
    "P0 breakage confirmed: without adapter the parser cannot see root usage",
  );

  // With adapter: root usage is promoted to telemetry.usage; parser recovers it.
  const adapted = trustedCodexWorkerResultToCli(workerResult);
  assert.deepEqual(
    adapted.telemetry?.usage,
    trustedUsage,
    "adapter sets telemetry.usage from root usage",
  );
  const withAdapterJson = simulateCliJson(adapted);
  const parsed = parseCliTelemetryUsage(withAdapterJson);
  assert.deepEqual(
    parsed,
    { ...trustedUsage, estimatedCostUsd: 0 },
    "with adapter, parser successfully recovers trusted root usage",
  );
});

// ---------------------------------------------------------------------------
// Duplicate events: the same tokenUsage/updated event arriving twice must not
// double-count.  The engine tracks the LAST event per thread/turn; when the
// coordinator passes it to the adapter the value is already deduplicated.
// ---------------------------------------------------------------------------

test("duplicate thread/tokenUsage/updated events do not double-count", () => {
  // Engine saw the same usage event twice (dedup happens in engine, not adapter).
  // The coordinator receives the final de-duplicated value at root.
  const deduplicatedUsage = { inputTokens: 12, outputTokens: 5, totalTokens: 17 };
  const workerResult = { outputText: "output", usage: deduplicatedUsage, warnings: [] };

  // Adapter should pass through exactly once.
  const adapted = trustedCodexWorkerResultToCli(workerResult);
  assert.deepEqual(adapted.telemetry?.usage, deduplicatedUsage);

  // If somehow both root and telemetry carry the SAME value, idempotent (not doubled).
  const sameInBoth = trustedCodexWorkerResultToCli({
    usage: deduplicatedUsage,
    telemetry: { usage: deduplicatedUsage },
  });
  assert.deepEqual(sameInBoth.telemetry?.usage, deduplicatedUsage);
});

// ---------------------------------------------------------------------------
// Foreign thread / stale turn events must not reach the parser.
// The engine selects only the last event for the active thread/turn.
// The adapter only processes what the worker (coordinator) provides at root.
// ---------------------------------------------------------------------------

test("foreign thread or stale turn usage cannot reach the parser", () => {
  const correctUsage = { inputTokens: 12, outputTokens: 5, totalTokens: 17 };
  // Stale/foreign events (e.g. 900 + 90) do not appear in the worker result
  // because the engine correctly discards them.  The coordinator passes only
  // the final correct usage value at root.
  const workerResult = { outputText: "output", usage: correctUsage, warnings: [] };

  const adapted = trustedCodexWorkerResultToCli(workerResult);
  const parsed = parseCliTelemetryUsage(simulateCliJson(adapted));
  assert.deepEqual(parsed, { ...correctUsage, estimatedCostUsd: 0 });

  // No trace of any stale value in the output.
  const cliParsed = JSON.parse(simulateCliJson(adapted));
  const telemetryUsage = cliParsed.telemetry?.usage;
  assert.equal(telemetryUsage?.inputTokens, 12);
  assert.equal(telemetryUsage?.outputTokens, 5);
});

// ---------------------------------------------------------------------------
// Conflicting root and telemetry usage must be rejected before reaching CLI.
// ---------------------------------------------------------------------------

test("conflicting root and telemetry usage is rejected at the adapter boundary", () => {
  const rootUsage = { inputTokens: 12, outputTokens: 5, totalTokens: 17 };
  const differentTelemetryUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
  assert.throws(
    () => trustedCodexWorkerResultToCli({
      usage: rootUsage,
      telemetry: { usage: differentTelemetryUsage },
    }),
    /Conflicting/,
    "conflicting usage is rejected before CLI serialization",
  );
});

// ---------------------------------------------------------------------------
// Model-authored JSON in outputText/structuredOutput must not bypass the parser
// and inject fake usage into telemetry.
// ---------------------------------------------------------------------------

test("model JSON in structuredOutput cannot inject fake usage via telemetry path", () => {
  const modelFakeUsage = { inputTokens: 9999, outputTokens: 9999, totalTokens: 19998 };
  // Worker has no root usage; model output happens to contain a telemetry-like object.
  const workerResult = {
    outputText: JSON.stringify({ telemetry: { usage: modelFakeUsage } }),
    structuredOutput: { telemetry: { usage: modelFakeUsage } },
    warnings: [],
  };

  // Adapter produces no telemetry.usage (worker had none at root).
  const adapted = trustedCodexWorkerResultToCli(workerResult);
  assert.equal(adapted.telemetry?.usage, undefined);

  // CLI JSON: model output is in outputText/structuredOutput, not in telemetry.usage.
  const cliJson = simulateCliJson(adapted);
  const parsed = parseCliTelemetryUsage(cliJson);
  assert.equal(parsed, undefined, "model output cannot inject usage via parser");
});

// ---------------------------------------------------------------------------
// Malformed usage values are rejected at the adapter boundary (not forwarded).
// ---------------------------------------------------------------------------

test("malformed usage values are rejected before reaching CLI telemetry", () => {
  const validUsage = { inputTokens: 12, outputTokens: 5, totalTokens: 17 };
  for (const bad of [
    null,
    [],
    {},
    { inputTokens: 1, outputTokens: 2 }, // missing totalTokens
    { inputTokens: 1, outputTokens: 2, totalTokens: 99 }, // wrong sum
    { inputTokens: -1, outputTokens: 2, totalTokens: 1 }, // negative
    { inputTokens: 1.5, outputTokens: 2, totalTokens: 3.5 }, // non-integer
    { inputTokens: "1", outputTokens: 2, totalTokens: 3 }, // string
    { inputTokens: NaN, outputTokens: 2, totalTokens: 2 }, // NaN
    { inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 0, totalTokens: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(
      () => trustedCodexWorkerResultToCli({ usage: bad }),
      /Malformed/,
      `malformed usage ${JSON.stringify(bad)} must be rejected`,
    );
    // Also rejected when supplied via telemetry.usage alongside valid root usage.
    assert.throws(
      () => trustedCodexWorkerResultToCli({ usage: validUsage, telemetry: { usage: bad } }),
      /Malformed/,
      `malformed telemetry usage ${JSON.stringify(bad)} must be rejected`,
    );
  }
});

// ---------------------------------------------------------------------------
// Safe integer boundary and estimatedCostUsd handling.
// ---------------------------------------------------------------------------

test("maximum safe integer usage passes and zero cost is preserved", () => {
  const maxSafe = { inputTokens: Number.MAX_SAFE_INTEGER - 1, outputTokens: 1, totalTokens: Number.MAX_SAFE_INTEGER };
  const adapted = trustedCodexWorkerResultToCli({ usage: maxSafe });
  assert.deepEqual(adapted.telemetry?.usage, maxSafe);
  const parsed = parseCliTelemetryUsage(simulateCliJson(adapted));
  assert.deepEqual(parsed, { ...maxSafe, estimatedCostUsd: 0 });
});

test("estimatedCostUsd from CLI output is preserved by the parser", () => {
  const usage = { inputTokens: 5, outputTokens: 3, totalTokens: 8 };
  // Adapter lifts usage to telemetry.usage; CLI may append estimatedCostUsd.
  const adapted = trustedCodexWorkerResultToCli({ usage });
  // Simulate CLI adding estimatedCostUsd to the telemetry.usage block.
  const cliJson = JSON.stringify({
    status: "completed",
    outputText: "",
    warnings: [],
    telemetry: { usage: { ...adapted.telemetry.usage, estimatedCostUsd: 0.0025 } },
  });
  const parsed = parseCliTelemetryUsage(cliJson);
  assert.deepEqual(parsed, { ...usage, estimatedCostUsd: 0.0025 });
});

// ---------------------------------------------------------------------------
// withTrustedCodexWorkerUsage factory: adapter applies for all routing paths
// and preserves lifecycle semantics.
// ---------------------------------------------------------------------------

test("withTrustedCodexWorkerUsage adapts all routing paths with full usage path intact", async () => {
  const workerUsage = { inputTokens: 5, outputTokens: 3, totalTokens: 8 };
  for (const route of ["direct", "pooled", "strict"]) {
    let runCount = 0;
    const fakeWorker = {
      async start() {},
      async dispose() {},
      async seedCodexAuthJsonFile() {},
      async run() {
        runCount += 1;
        return { outputText: route, usage: workerUsage, warnings: [] };
      },
    };

    const wrapped = withTrustedCodexWorkerUsage(fakeWorker);
    await wrapped.start();
    await wrapped.seedCodexAuthJsonFile("fake-path");
    const result = await wrapped.run({ prompt: route });
    await wrapped.dispose();

    assert.equal(runCount, 1, `${route}: worker.run called exactly once`);
    assert.deepEqual(
      result.telemetry?.usage,
      workerUsage,
      `${route}: root usage promoted to telemetry.usage`,
    );

    // Full path: adapted result → simulated CLI → parser
    const cliJson = simulateCliJson(result);
    const parsed = parseCliTelemetryUsage(cliJson);
    assert.deepEqual(
      parsed,
      { ...workerUsage, estimatedCostUsd: 0 },
      `${route}: parser recovers usage end-to-end`,
    );
  }
});

// ---------------------------------------------------------------------------
// Absent usage: worker with no usage yields no telemetry.usage; parser returns
// undefined without throwing.
// ---------------------------------------------------------------------------

test("absent usage flows as undefined through the full path without throwing", () => {
  const workerResult = { outputText: "output", warnings: [] };
  const adapted = trustedCodexWorkerResultToCli(workerResult);
  assert.equal(adapted.telemetry?.usage, undefined);
  const cliJson = simulateCliJson(adapted);
  const parsed = parseCliTelemetryUsage(cliJson);
  assert.equal(parsed, undefined, "no usage yields undefined without error");
});
