import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createAssessmentProgress, assessmentProgressPrefix } from "./assessment-cli-progress.mjs";
const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, compilerOptions: { rootDir: process.cwd() } });
const { createAssessmentProgressParser, parseAssessmentProgressLine } = require("../src/subscription-runtime-cli-progress.ts");
const callbacks = ["session.read.started", "session.read.completed", "lease.acquire.started", "lease.acquire.completed",
  "provider.refresh.started", "provider.refresh.completed", "provider.refresh.skipped", "session.writeback.started",
  "session.writeback.completed", "provider.task.started", "provider.task.completed", "session.task_update.writeback.started",
  "session.task_update.writeback.completed", "session.task_update.writeback.failed"];
const privateValue = "synthetic-private-metadata";
function bridge(write) {
  return createAssessmentProgress({ write, now: () => 12, remaining: () => 50_000 });
}

test("all existing callback and wrapper records survive independent validation; metadata cannot leak", () => {
  const lines = [], records = [], progress = bridge((line) => lines.push(line));
  for (const name of callbacks) progress.emit({ name, durationMs: -99, metadata: {
    status: "failed", prompt: privateValue, sessionId: privateValue, output: privateValue }, unexpected: privateValue });
  for (const phase of ["setup", "account_materialization", "executor_run", "auth_cleanup", "cancellation", "task_settlement", "disposal"]) {
    progress.mark(phase, "observed", { taskSettled: false, disposeSettled: true, disposeSucceeded: false, text: privateValue });
  }
  const parse = createAssessmentProgressParser((record) => records.push(record));
  for (const line of lines) for (const byte of Buffer.from(line)) parse(Buffer.from([byte]));
  assert.equal(records.length, callbacks.length + 7);
  assert.equal(JSON.stringify(records).includes(privateValue), false);
  assert.ok(records.every((r) => r.providerOutcome === "unknown"));
  assert.ok(records.some((r) => r.phase === "provider.task" && r.transition === "completed" && r.providerOutcome === "unknown"));
  assert.equal(lines.some((line) => /initialize|turn|journal/.test(line)), false);
});

test("bounded parser recovers after oversized stderr within its lifetime byte budget", () => {
  const lines = [], records = []; bridge((line) => lines.push(line)).emit({ name: "provider.task.started" });
  const parse = createAssessmentProgressParser((record) => records.push(record));
  const giant = Buffer.alloc(2 * 1024, 120);
  for (let i = 0; i < 8; i++) parse(giant);
  parse(Buffer.from(`\n${lines[0]}${assessmentProgressPrefix}${"x".repeat(1025)}\n${lines[0]}`));
  assert.equal(records.length, 2);
  parse(Buffer.from(lines[0].repeat(100))); assert.equal(records.length, 64);
});

test("reject malformed fields and reconstruct allowlisted scalars only", () => {
  let line; bridge((value) => { line = value; }).emit({ name: "provider.task.started" });
  const record = JSON.parse(line.slice(assessmentProgressPrefix.length));
  for (const bad of [{ version: 2 }, { phase: "initialize" }, { transition: "native_settled" },
    { remainingMs: -1 }, { elapsedMs: 0.5 }, { remainingMs: 1e99 }, { remainingMs: Infinity },
    { elapsedMs: "1" }, { providerOutcome: "settled" }, { lastObservedPhase: privateValue }, { taskSettled: "true" }]) {
    assert.equal(parseAssessmentProgressLine(assessmentProgressPrefix + JSON.stringify({ ...record, ...bad })), undefined);
  }
  for (const bad of ["{", "[]", "null", "false", '{"elapsedMs":NaN}', '{"remainingMs":1e999}']) {
    assert.equal(parseAssessmentProgressLine(assessmentProgressPrefix + bad), undefined);
  }
  assert.deepEqual(parseAssessmentProgressLine(assessmentProgressPrefix + JSON.stringify({ ...record,
    prompt: privateValue, tenantId: privateValue, metadata: { value: privateValue }, __proto__: { unexpected: privateValue } })), record);
});

test("flood and backpressure cannot delay cleanup markers or throw through observability", () => {
  const lines = [], progress = bridge((line) => { lines.push(line); return false; });
  for (let i = 0; i < 1000; i++) progress.emit({ name: "provider.task.started", metadata: { text: privateValue } });
  progress.mark("cancellation", "observed"); progress.mark("task_settlement", "observed", { taskSettled: false });
  progress.mark("disposal", "observed", { disposeSettled: false });
  assert.equal(lines.length, 64);
  assert.equal(JSON.parse(lines.at(-1).slice(assessmentProgressPrefix.length)).phase, "disposal");
  const throwing = bridge(() => { throw new Error(privateValue); });
  assert.doesNotThrow(() => throwing.emit({ name: "provider.task.started" }));
  const parse = createAssessmentProgressParser(() => { throw new Error(privateValue); });
  assert.doesNotThrow(() => parse(Buffer.from(lines.join(""))));
  assert.doesNotThrow(() => { progress.count(privateValue, 1); progress.timing(privateValue, 1); });
});

for (const invalid of ["\n", "not-progress\n", `${assessmentProgressPrefix}{\n`]) {
  test(`invalid frame flood closes parser with bounded work: ${JSON.stringify(invalid)}`, (t) => {
    let parsed = 0, scans = 0, received = 0;
    const originalParse = JSON.parse, originalIndexOf = Buffer.prototype.indexOf;
    t.mock.method(JSON, "parse", (...args) => { parsed++; return originalParse(...args); });
    t.mock.method(Buffer.prototype, "indexOf", function (...args) {
      scans++; return originalIndexOf.apply(this, args);
    });
    const parse = createAssessmentProgressParser(() => received++);
    parse(Buffer.from(invalid.repeat(10_000)));
    const work = { parsed, scans };
    let valid; bridge((line) => { valid = line; }).emit({ name: "provider.task.started" });
    for (let i = 0; i < 100; i++) parse(Buffer.from(valid));
    assert.deepEqual({ parsed, scans }, work, "exhaustion is permanent across chunks");
    assert.ok(parsed <= 256); assert.equal(scans, 256); assert.equal(received, 0);
  });
}

for (const chunkSize of [17, 2 * 1024 * 1024]) {
  test(`oversized stream has finite total scanned bytes with chunks of ${chunkSize}`, (t) => {
    let scanned = 0, parses = 0, received = 0;
    const originalIndexOf = Buffer.prototype.indexOf, originalParse = JSON.parse;
    t.mock.method(Buffer.prototype, "indexOf", function (value, offset) {
      scanned += this.length - offset;
      return originalIndexOf.call(this, value, offset);
    });
    t.mock.method(JSON, "parse", (...args) => { parses++; return originalParse(...args); });
    const parse = createAssessmentProgressParser(() => received++);
    const chunk = Buffer.alloc(chunkSize, 120);
    for (let i = 0; i < Math.ceil(512 * 1024 / chunkSize) + 2; i++) parse(chunk);
    assert.equal(scanned, 256 * 1024);
    parse(Buffer.from(`\n${assessmentProgressPrefix}{}\n`));
    assert.equal(scanned, 256 * 1024); assert.equal(parses, 0); assert.equal(received, 0);
  });
}

test("oversized frames count toward the frame budget; split ordinary records recover before exhaustion", () => {
  let valid; bridge((line) => { valid = line; }).emit({ name: "provider.task.completed" });
  const records = [], parse = createAssessmentProgressParser((record) => records.push(record));
  // Empty and invalid lines consume 254 frames, then one oversized frame and one valid frame.
  parse(Buffer.from("\ninvalid\n".repeat(127)));
  parse(Buffer.alloc(1025, 120)); parse(Buffer.from("\n"));
  const bytes = Buffer.from(valid);
  parse(bytes.subarray(0, 7)); parse(bytes.subarray(7)); parse(bytes);
  assert.equal(records.length, 1); assert.equal(records[0].transition, "completed");
});

test("each cleanup observation owns one slot regardless of order, repetition or ordinary observed floods", () => {
  for (const order of [["cancellation", "task_settlement", "disposal"], ["disposal", "task_settlement", "cancellation"]]) {
    const lines = [], progress = bridge((line) => lines.push(line));
    for (let i = 0; i < 100; i++) progress.mark("setup", "observed");
    for (const phase of order) {
      for (let i = 0; i < 100; i++) {
        progress.mark(phase, "started");
        progress.mark(phase, "observed", { taskSettled: false, disposeSettled: false });
      }
    }
    const records = lines.map((line) => parseAssessmentProgressLine(line.trimEnd()));
    assert.equal(records.length, 64);
    assert.deepEqual(records.slice(61).map((record) => record.phase), order);
    assert.ok(records.slice(61).every((record) => record.transition === "observed"));
  }
});

test("early cleanup and failed writes cannot consume another cleanup slot or the ordinary budget", () => {
  let writes = 0;
  const progress = bridge(() => { writes++; throw new Error(privateValue); });
  for (let i = 0; i < 100; i++) progress.mark("cancellation", "observed");
  for (let i = 0; i < 100; i++) progress.emit({ name: "session.read.completed" });
  progress.mark("task_settlement", "observed", { taskSettled: true });
  progress.mark("disposal", "observed", { disposeSettled: true, disposeSucceeded: true });
  assert.equal(writes, 64);
});
