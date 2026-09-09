import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test, { before, after } from "node:test";
import FakeTimers from "@sinonjs/fake-timers";
import { createAssessmentCliLifecycle } from "./assessment-cli-lifecycle.mjs";
import { withTrustedCodexWorkerUsage } from "./codex-worker-cli-usage.mjs";
import { completed, deferred, fakeIo, legacyArgs, legacyFixture, request, waitFor } from "./assessment-cli-test-support.mjs";

let fixture;
before(async () => { fixture = await legacyFixture(); });
after(async () => { await fixture?.close(); });

function harness(t, options = {}) {
  const clock = FakeTimers.install({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  t.after(() => clock.uninstall());
  const signals = new EventEmitter(), marks = [], calls = [];
  const lifecycle = createAssessmentCliLifecycle({ signals, mark: (...args) => marks.push(args), ...options });
  lifecycle.configure(true, 60_000);
  const io = fakeIo(fixture.root);
  const worker = { start: async () => { calls.push("start"); }, seedCodexAuthJsonFile: async () => { calls.push("seed"); },
    run: async () => completed, dispose: async () => { calls.push("dispose"); } };
  const run = (args = legacyArgs) => lifecycle.runCli(() => fixture.runSubscriptionAgentTaskCli(args, io,
    () => lifecycle.decorateWorker(withTrustedCodexWorkerUsage(worker))));
  // Legacy resolveRequestCwd performs a read-only realpath of this empty sandbox.
  const started = async () => {
    await waitFor(() => calls.includes("start"));
    assert.ok(calls.includes("start"), io.stderr.join(""));
  };
  return { clock, signals, marks, calls, lifecycle, io, worker, run, started };
}

for (const rejection of [false, true]) test(`actual legacy abort ${rejection ? "rejects" : "resolves"} before one disposal`, async (t) => {
  const h = harness(t), held = deferred();
  let aborts = 0;
  h.worker.run = async ({ abortSignal }) => {
    abortSignal.addEventListener("abort", () => { aborts++; h.calls.push("abort");
      if (rejection) held.reject(new Error("Synthetic late rejection")); else held.resolve(completed);
    });
    try { return await held.promise; } finally { h.calls.push("settled"); }
  };
  const result = h.run(); await h.started(); await h.clock.tickAsync(40_000);
  assert.equal(await result, 1);
  h.signals.emit("SIGTERM"); h.signals.emit("SIGINT");
  assert.equal(aborts, 1);
  assert.deepEqual(h.calls, ["start", "abort", "settled", "dispose"]);
  assert.ok(h.marks.some(([p, , r]) => p === "task_settlement" && r.taskSettled === true));
  assert.ok(h.marks.some(([p, , r]) => p === "disposal" && r?.disposeSucceeded === true));
  assert.equal(h.clock.countTimers(), 0);
  assert.equal(h.signals.listenerCount("SIGTERM"), 0);
});

test("actual legacy pending run gets 5s settlement, then 11s disposal; late rejection is observed", async (t) => {
  const h = harness(t), held = deferred(), stop = deferred();
  h.worker.run = () => held.promise;
  h.worker.dispose = () => { h.calls.push("dispose"); return stop.promise; };
  let returned = false;
  const result = h.run().then((code) => { returned = true; return code; }); await h.started();
  await h.clock.tickAsync(44_999); assert.equal(h.calls.includes("dispose"), false);
  await h.clock.tickAsync(1); assert.equal(h.calls.filter((x) => x === "dispose").length, 1);
  await h.clock.tickAsync(10_999); assert.equal(returned, false);
  await h.clock.tickAsync(1); assert.equal(await result, 1);
  assert.ok(h.marks.some(([p, , r]) => p === "task_settlement" && r.taskSettled === false));
  assert.deepEqual(h.marks.at(-1), ["disposal", "observed", { disposeSettled: false }]);
  assert.equal(h.signals.listenerCount("SIGTERM"), 1, "background work retains cancellation protection");
  held.reject(new Error("Synthetic delayed rejection")); stop.resolve();
  await h.clock.tickAsync(0);
  assert.equal(h.calls.filter((x) => x === "dispose").length, 1);
  assert.equal(h.signals.listenerCount("SIGTERM"), 0);
  assert.equal(h.clock.countTimers(), 0);
});

for (const phase of ["start", "seedCodexAuthJsonFile"]) test(`cancel held ${phase} prevents later run`, async (t) => {
  const h = harness(t), held = deferred(); let runs = 0, entered = false;
  h.worker[phase] = () => { entered = true; h.calls.push("start"); return held.promise; };
  h.worker.run = async () => { runs++; return completed; };
  const result = h.run([...legacyArgs, "--codex-auth-json", "/synthetic-unused"]);
  await waitFor(() => entered);
  assert.equal(entered, true);
  h.signals.emit("SIGTERM"); await h.clock.tickAsync(5_000);
  assert.equal(await result, 1); held.resolve(); await h.clock.tickAsync(0);
  assert.equal(runs, 0); assert.equal(h.calls.filter((x) => x === "dispose").length, 1);
  assert.equal(h.clock.countTimers(), 0);
});

test("setup cutoff before legacy factory forbids late provider creation", async (t) => {
  const h = harness(t), held = deferred(); let factories = 0;
  const result = h.lifecycle.runCli(async () => {
    await h.lifecycle.work(() => held.promise);
    factories++; return h.run();
  });
  await h.clock.tickAsync(0); h.signals.emit("SIGTERM"); await h.clock.tickAsync(5_000);
  assert.equal(await result, 1);
  assert.deepEqual(h.marks.at(-1), ["disposal", "observed", { disposeSettled: false }]);
  held.resolve(); await h.clock.tickAsync(0);
  assert.equal(factories, 0); assert.equal(h.signals.listenerCount("SIGTERM"), 0);
});

test("startup budget remains anchored and wall-clock changes cannot extend it", async (t) => {
  const h = harness(t, { parentDeadline: 55_000 });
  await h.clock.tickAsync(30_000);
  h.clock.setSystemTime(999_999);
  h.lifecycle.configure(true, 60_000);
  assert.equal(h.lifecycle.remaining(), 25_000);
  await h.clock.tickAsync(5_000);
  assert.throws(() => h.lifecycle.checkpoint(), /cancelled/);
  assert.equal(h.marks.filter(([p]) => p === "cancellation").length, 1);
  assert.equal(await h.lifecycle.runCli(async () => 0), 1);
});

test("normal legacy result preserves canonical output and usage, observes slow disposal beyond legacy 5s", async (t) => {
  const h = harness(t), stop = deferred(); let returned = false;
  h.worker.dispose = () => { h.calls.push("dispose"); return stop.promise; };
  const result = h.run().then((code) => { returned = true; return code; }); await h.started();
  await h.clock.tickAsync(5_001);
  assert.equal(returned, false, "legacy disposal timeout is not cleanup completion");
  assert.match(h.io.stderr.join(""), /dispose_timeout/);
  const output = JSON.parse(h.io.stdout.join(""));
  assert.equal(output.status, "completed"); assert.deepEqual(output.structuredOutput, { reviews: [] });
  assert.deepEqual(output.telemetry.usage, completed.usage);
  stop.resolve(); await h.clock.tickAsync(0);
  assert.equal(await result, 0); assert.equal(h.clock.countTimers(), 0);
  assert.equal(h.signals.listenerCount("SIGINT"), 0);
});

test("cancellation during normal disposal reuses the promise and bounded reserve", async (t) => {
  const h = harness(t), stop = deferred();
  h.worker.dispose = () => { h.calls.push("dispose"); return stop.promise; };
  const result = h.run(); await h.started(); await h.clock.tickAsync(39_999);
  h.signals.emit("SIGINT"); await h.clock.tickAsync(11_000);
  assert.equal(await result, 1);
  assert.equal(h.calls.filter((x) => x === "dispose").length, 1);
  assert.deepEqual(h.marks.at(-1), ["disposal", "observed", { disposeSettled: false }]);
  stop.reject(new Error("Synthetic disposal failure")); await h.clock.tickAsync(0);
  assert.equal(h.signals.listenerCount("SIGINT"), 0);
});

test("completed fake task with pending auth removal remains unsettled", async (t) => {
  const h = harness(t), removal = deferred();
  h.worker.run = async () => { try { return completed; } finally { await removal.promise; } };
  const result = h.run(); await h.started(); await h.clock.tickAsync(45_000);
  assert.equal(await result, 1);
  assert.ok(h.marks.some(([p, , r]) => p === "task_settlement" && r.taskSettled === false));
  removal.resolve(); await h.clock.tickAsync(0);
});

test("legacy input setup held before factory is an unsettled operation", async (t) => {
  const h = harness(t), input = deferred(); let factories = 0;
  h.io.readStdin = () => input.promise;
  const result = h.lifecycle.runCli(() => fixture.runSubscriptionAgentTaskCli(legacyArgs, h.io, () => {
    h.lifecycle.checkpoint(); factories++; return h.lifecycle.decorateWorker(h.worker);
  }));
  await h.clock.tickAsync(45_000); assert.equal(await result, 1);
  assert.ok(h.marks.some(([p, , r]) => p === "task_settlement" && r.taskSettled === false));
  input.resolve(JSON.stringify(request));
  await waitFor(() => h.signals.listenerCount("SIGTERM") === 0);
  assert.equal(factories, 0); assert.equal(h.signals.listenerCount("SIGTERM"), 0);
});

test("direct admission uses entry time, and configurable small fake reserves do not restart a deadline", async (t) => {
  const clock = FakeTimers.createClock(0), signals = new EventEmitter(), marks = [];
  const lifecycle = createAssessmentCliLifecycle({ now: () => clock.now, wallNow: () => clock.now,
    timers: clock, signals, reserveMs: 20, settlementMs: 5, disposalMs: 11, marginMs: 4,
    mark: (...args) => marks.push(args) });
  await clock.tickAsync(90);
  assert.throws(() => lifecycle.configure(true, 100), /cancelled/);
  let started = false;
  assert.equal(await lifecycle.runCli(() => lifecycle.work(() => { started = true; return 0; })), 1);
  assert.equal(started, false); assert.equal(clock.countTimers(), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
  assert.equal(marks.filter(([phase]) => phase === "cancellation").length, 1);
});

test("actual disposal rejection has a distinct failure receipt without leaking its reason", async (t) => {
  const h = harness(t);
  h.worker.dispose = async () => { throw new Error("Synthetic private disposal detail"); };
  const result = h.run(); await h.started(); await h.clock.tickAsync(0);
  assert.equal(await result, 0, "legacy result/exit semantics are unchanged by a disposal error");
  assert.deepEqual(h.marks.at(-1), ["disposal", "observed", { disposeSettled: true, disposeSucceeded: false }]);
  assert.equal(JSON.stringify(h.marks).includes("private disposal detail"), false);
  assert.equal(h.clock.countTimers(), 0);
});

test("legacy job cancellation reaches the same settlement and disposal coordinator", async (t) => {
  const h = harness(t), held = deferred(), legacy = new AbortController();
  let aborts = 0;
  const worker = h.lifecycle.decorateWorker({ start: async () => {},
    run: ({ abortSignal }) => { abortSignal.addEventListener("abort", () => { aborts++; held.resolve(completed); }); return held.promise; },
    dispose: async () => { h.calls.push("dispose"); } });
  const result = h.lifecycle.runCli(() => worker.run({ abortSignal: legacy.signal }));
  await h.clock.tickAsync(0); legacy.abort(); await h.clock.tickAsync(0);
  assert.equal(await result, 1); assert.equal(aborts, 1); assert.deepEqual(h.calls, ["dispose"]);
  assert.ok(h.marks.some(([p, , r]) => p === "task_settlement" && r.taskSettled));
});

test("already aborted legacy signal cannot launch new worker work", async (t) => {
  const h = harness(t), legacy = new AbortController(); legacy.abort(); let runs = 0;
  const worker = h.lifecycle.decorateWorker({ run: async () => { runs++; return completed; }, dispose: async () => {} });
  const result = h.lifecycle.runCli(() => worker.run({ abortSignal: legacy.signal }));
  await h.clock.tickAsync(0); assert.equal(await result, 1); assert.equal(runs, 0);
});
