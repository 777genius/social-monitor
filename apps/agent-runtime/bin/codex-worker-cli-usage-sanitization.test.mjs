import assert from "node:assert/strict";
import test from "node:test";
import { withTrustedCodexWorkerUsage } from "./codex-worker-cli-usage.mjs";

const usage = Object.freeze({ inputTokens: 12, outputTokens: 5, totalTokens: 17 });
const otherUsage = Object.freeze({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
const cases = [
  ["malformed root", { usage: null }],
  ["malformed telemetry", { telemetry: { usage: {} } }],
  ["malformed root with valid telemetry", { usage: {}, telemetry: { usage } }],
  ["malformed telemetry with valid root", { usage, telemetry: { usage: [] } }],
  ["conflicting valid blocks", { usage, telemetry: { usage: otherUsage } }],
];

for (const [name, metadata] of cases) {
  test(`wrapper removes both usage locations: ${name}`, async (t) => {
    const diagnostic = t.mock.method(console, "error", () => {});
    const original = Object.freeze({
      status: "completed", outputText: "completed fixture output",
      structuredOutput: Object.freeze({ usage: "model content is not accounting" }),
      warnings: Object.freeze([]), customField: "retained", ...metadata,
      telemetry: Object.freeze({ durationMs: 123, providerField: "retained", ...metadata.telemetry }),
    });
    const before = structuredClone(original);
    const events = [];
    const worker = withTrustedCodexWorkerUsage({
      start(...args) { events.push(["start", ...args]); return "started"; },
      seedCodexAuthJsonFile(...args) { events.push(["seed", ...args]); return "seeded"; },
      async run(...args) { events.push(["run", ...args]); return original; },
      dispose(...args) { events.push(["dispose", ...args]); return "disposed"; },
    });
    assert.equal(worker.start("fixture"), "started");
    assert.equal(worker.seedCodexAuthJsonFile("fixture-path"), "seeded");
    const result = await worker.run("fixture-job");
    assert.equal(worker.dispose("fixture"), "disposed");
    assert.deepEqual(events, [["start", "fixture"], ["seed", "fixture-path"],
      ["run", "fixture-job"], ["dispose", "fixture"]]);
    assert.equal(Object.hasOwn(result, "usage"), false);
    assert.equal(Object.hasOwn(result.telemetry, "usage"), false);
    const expected = { ...before, telemetry: { ...before.telemetry } };
    delete expected.usage;
    delete expected.telemetry.usage;
    assert.deepEqual(result, expected);
    assert.notEqual(result, original);
    assert.notEqual(result.telemetry, original.telemetry);
    assert.equal(result.structuredOutput, original.structuredOutput);
    assert.equal(result.warnings, original.warnings);
    assert.deepEqual(original, before);
    assert.deepEqual(diagnostic.mock.calls.map(({ arguments: args }) => args),
      [["codex-worker-cli-usage: dropping untrusted usage"]]);
  });
}

test("absent usage and valid equal blocks remain unchanged in meaning", async (t) => {
  const diagnostic = t.mock.method(console, "error", () => {});
  for (const metadata of [{}, { usage }, { telemetry: { usage } }, { usage, telemetry: { usage: { ...usage } } }]) {
    const original = { outputText: "fixture", ...metadata };
    const before = structuredClone(original);
    const result = await withTrustedCodexWorkerUsage({ run: async () => original }).run();
    if (Object.keys(metadata).length === 0) assert.equal(result, original);
    else assert.deepEqual(result.telemetry.usage, usage);
    assert.deepEqual(original, before);
  }
  assert.equal(diagnostic.mock.callCount(), 0);
});

test("unrelated worker and metadata implementation errors propagate without diagnostics", async (t) => {
  const diagnostic = t.mock.method(console, "error", () => {});
  // Matching text is deliberately insufficient to identify our validation error.
  const error = new Error("Malformed trusted Codex usage");
  for (const run of [
    async () => { throw error; },
    async () => ({ get usage() { throw error; } }),
    async () => ({ usage: { get inputTokens() { throw error; } } }),
    async () => ({ usage, get outputText() { throw error; } }),
  ]) {
    await assert.rejects(withTrustedCodexWorkerUsage({ run }).run(), (caught) => caught === error);
  }
  assert.equal(diagnostic.mock.callCount(), 0);
});

test("malformed root preserves absent or null nonusage telemetry", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const metadata of [{}, { telemetry: null }]) {
    const original = Object.freeze({ outputText: "fixture", usage: null, ...metadata });
    const result = await withTrustedCodexWorkerUsage({ run: async () => original }).run();
    assert.deepEqual(result, { outputText: "fixture", ...metadata });
    assert.equal(original.usage, null);
  }
});
