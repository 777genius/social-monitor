import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  ReaderSummaryChildSupervisor,
  createReaderSummaryFixtureStageObserver,
  createReaderSummaryIntegrationResultObserver,
  emitReaderSummaryDriveDiagnostics,
  parseReaderSummaryFixtureStageLine,
  readReaderSummaryDiagnosticLogTail,
  readerSummaryFixtureStartupStages,
  waitForReaderSummaryChild,
  waitForReaderSummaryChildWithTimeout,
  waitForReaderSummaryFixture,
} from "./reader-summary-process-lifecycle.mjs";

const documentedBearerPlaceholder = "token-value";

class FakeChild extends EventEmitter {
  constructor(pid = 1234) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }

  close(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("close", code, signal);
  }
}

const createFakeClock = () => {
  let current = 0;
  let nextId = 1;
  const timers = new Map();
  const now = () => current;
  const setTimer = (callback, delayMs) => {
    const handle = { id: nextId, unref: () => undefined };
    nextId += 1;
    timers.set(handle, { callback, dueAt: current + delayMs });
    return handle;
  };
  const clearTimer = (handle) => timers.delete(handle);
  const advance = (durationMs) => {
    const target = current + durationMs;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort(
          ([firstHandle, first], [secondHandle, second]) =>
            first.dueAt - second.dueAt || firstHandle.id - secondHandle.id,
        )[0];
      if (next === undefined) break;
      const [handle, timer] = next;
      timers.delete(handle);
      current = timer.dueAt;
      timer.callback();
    }
    current = target;
  };
  const advanceWithoutTimers = (durationMs) => {
    current += durationMs;
  };
  const fireNextTimerEarly = (earlyByMs) => {
    const [handle, timer] = [...timers.entries()].sort(
      ([firstHandle, first], [secondHandle, second]) =>
        first.dueAt - second.dueAt || firstHandle.id - secondHandle.id,
    )[0];
    timers.delete(handle);
    current = timer.dueAt - earlyByMs;
    timer.callback();
  };
  return {
    advance,
    advanceWithoutTimers,
    activeTimerCount: () => timers.size,
    clearTimer,
    fireNextTimerEarly,
    now,
    setTimer,
  };
};

test("supervisor terminates every process group and cleanup is idempotent", async () => {
  const first = new FakeChild(4321);
  const second = new FakeChild(4322);
  const children = [first, second];
  const alive = new Set(children.map((child) => child.pid));
  const signals = [];
  const supervisor = new ReaderSummaryChildSupervisor({
    spawnProcess: () => children.shift(),
    killGroup: (pid, signal) => {
      signals.push([pid, signal]);
      alive.delete(pid);
      [first, second].find((child) => child.pid === pid)?.close(null, signal);
    },
    groupExists: (pid) => alive.has(pid),
    graceMs: 1,
  });
  supervisor.spawn("fixture", []);
  supervisor.spawn("driver", []);
  await Promise.all([supervisor.cleanup(), supervisor.cleanup()]);
  assert.deepEqual(signals, [
    [4321, "SIGTERM"],
    [4322, "SIGTERM"],
  ]);
  assert.throws(
    () => supervisor.spawn("late-child", []),
    /already cleaning up/u,
  );
});

test("supervisor escalates a recorded group whose leader already closed", async () => {
  const child = new FakeChild(7654);
  const signals = [];
  let groupAlive = true;
  const supervisor = new ReaderSummaryChildSupervisor({
    spawnProcess: () => child,
    killGroup: (pid, signal) => {
      signals.push([pid, signal]);
      if (signal === "SIGKILL") groupAlive = false;
    },
    groupExists: () => groupAlive,
    graceMs: 1,
  });
  supervisor.spawn("fixture", []);
  child.close(0);
  await supervisor.cleanup();
  assert.deepEqual(signals, [
    [7654, "SIGTERM"],
    [7654, "SIGKILL"],
  ]);
});

test("supervisor bounds escalation when an orphan group ignores signals", async () => {
  const child = new FakeChild(8765);
  const signals = [];
  const supervisor = new ReaderSummaryChildSupervisor({
    spawnProcess: () => child,
    killGroup: (pid, signal) => signals.push([pid, signal]),
    groupExists: () => true,
    graceMs: 5,
  });
  supervisor.spawn("fixture", []);
  child.close(0);
  await assert.rejects(
    supervisor.cleanup(),
    /could not terminate process groups/u,
  );
  assert.deepEqual(signals, [
    [8765, "SIGTERM"],
    [8765, "SIGKILL"],
  ]);
});

test("supervisor fails fast on Windows", () => {
  assert.throws(
    () => new ReaderSummaryChildSupervisor({ platform: "win32" }),
    /POSIX-only/u,
  );
});

test("terminal observer accepts only integration_driver records from stdout", async () => {
  const success = createReaderSummaryIntegrationResultObserver();
  success.observeStdout("tool says All tests passed. in prose\n");
  success.observeStdout("All tests ");
  success.observeStdout("passed.\n");
  assert.deepEqual(await success.result, { passed: true });

  const failure = createReaderSummaryIntegrationResultObserver();
  failure.observeStdout("Failure Details:\nscenario failed\n");
  assert.deepEqual(await failure.result, { passed: false });
});

test("child waiting has a bounded grace result", async () => {
  const child = new FakeChild();
  assert.deepEqual(await waitForReaderSummaryChildWithTimeout(child, 2), {
    timedOut: true,
  });
  const exited = waitForReaderSummaryChild(child);
  child.close(7, null);
  assert.deepEqual(await exited, { code: 7, signal: null });
});

test("child waiting observes an exit that completed before registration", async () => {
  const child = new FakeChild();
  child.close(0, null);
  assert.deepEqual(await waitForReaderSummaryChildWithTimeout(child, 2), {
    result: { code: 0, signal: null },
  });
});

test("fixture stage parsing accepts ordered allowlisted progress only", () => {
  let clock = 1_000;
  const observer = createReaderSummaryFixtureStageObserver({
    now: () => clock,
  });
  assert.deepEqual(
    parseReaderSummaryFixtureStageLine(
      '{"status":"stage","stage":"module_runtime_entry","elapsedMs":0}',
    ),
    { stage: "module_runtime_entry", elapsedMs: 0 },
  );
  assert.deepEqual(
    observer.observe(
      '{"status":"stage","stage":"module_runtime_entry","elapsedMs":0}',
    ),
    { stage: "module_runtime_entry", elapsedMs: 0 },
  );
  clock = 1_025;
  assert.deepEqual(
    observer.observe(
      '{"status":"stage","stage":"prisma_db_push_start","elapsedMs":20}',
    ),
    { stage: "prisma_db_push_start", elapsedMs: 20 },
  );
  for (const ignored of [
    "not json",
    '{"status":"stage","stage":"provider-payload","elapsedMs":21}',
    '{"status":"stage","stage":"prisma_db_push_end","elapsedMs":"22"}',
    '{"status":"stage","stage":"pglite_socket_start","elapsedMs":23}',
    '{"status":"stage","stage":"prisma_db_push_end","elapsedMs":19}',
  ]) {
    assert.equal(observer.observe(ignored), undefined);
  }
  clock = 1_040;
  assert.deepEqual(observer.snapshot(), {
    stage: "prisma_db_push_start",
    elapsedMs: 20,
    ageMs: 15,
  });
  assert.equal(readerSummaryFixtureStartupStages.at(0), "module_runtime_entry");
  assert.equal(readerSummaryFixtureStartupStages.at(-1), "ready");
});

test("drive diagnostics are bounded, redacted, and keep log streams separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-summary-drive-logs-"));
  const driver = join(root, "driver.log");
  const browser = join(root, "browser.log");
  const output = [];
  try {
    await writeFile(
      driver,
      `visible driver\nAuthorization: Bearer ${documentedBearerPlaceholder}\n` +
        "profile=/private/Driver Folder/profile\n",
    );
    await writeFile(
      browser,
      "visible browser\nforward-unc=//private-server/private-share/file\n" +
        "repeated=////private-host/private-path/file\n" +
        "backslash-unc=\\\\private-server\\private-share\\file\n",
    );
    await emitReaderSummaryDriveDiagnostics({
      browserLogPath: browser,
      chromeDriverLogPath: driver,
      forward: (diagnostic) => output.push(diagnostic),
    });
    assert.equal(output.length, 2);
    assert.match(output[0], /ChromeDriver log tail/u);
    assert.match(output[0], /visible driver/u);
    assert.match(output[1], /Chrome browser log tail/u);
    assert.match(output[1], /visible browser/u);
    assert.match(output.join(""), /Authorization=\[REDACTED\]/u);
    assert.match(output.join(""), /\[REDACTED PATH\]/u);
    assert.doesNotMatch(
      output.join(""),
      /token-value|Driver Folder|private-server|private-share|private-host|private-path/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("diagnostic tail handles missing logs without exposing their path", async () => {
  const tail = await readReaderSummaryDiagnosticLogTail({
    logPath: join(tmpdir(), "reader-summary-private-missing", "browser.log"),
    maxBytes: 128,
  });
  assert.equal(tail, "[Diagnostic log is unavailable]");
  assert.doesNotMatch(tail, /reader-summary-private-missing/u);
});

test("valid progress extends fixture startup beyond the former absolute timeout", async () => {
  const child = new FakeChild();
  const clock = createFakeClock();
  let stdout = "";
  let stderr = "";
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 180,
    hardStartupTimeoutMs: 600,
    parseReadyLine: (line) => {
      const record = JSON.parse(line);
      return record.status === "ready" ? record.baseUrl : undefined;
    },
    forwardStdout: (chunk) => {
      stdout += chunk;
    },
    forwardStderr: (chunk) => {
      stderr += chunk;
    },
    ...clock,
  });
  child.stderr.write("token=private-token\n");
  child.stdout.write(
    '{"status":"stage","stage":"module_runtime_entry","elapsedMs":0}\n',
  );
  clock.advance(170);
  child.stdout.write(
    '{"status":"stage","stage":"prisma_db_push_start","elapsedMs":170}\n',
  );
  clock.advance(170);
  child.stdout.write(
    '{"status":"stage","stage":"nest_module_compile_start","elapsedMs":340}\n',
  );
  clock.advance(170);
  child.stdout.write('{"status":"rea');
  child.stdout.write('dy","baseUrl":"http://127.0.0.1:1234"}\n');
  assert.equal(await ready, "http://127.0.0.1:1234");
  assert.equal(clock.now(), 510);
  assert.match(stdout, /module_runtime_entry/u);
  assert.match(stdout, /nest_module_compile_start/u);
  assert.match(stdout, /"status":"ready"/u);
  assert.match(stderr, /token=\[REDACTED\]/u);
  assert.doesNotMatch(stderr, /private-token/u);
  assert.equal(clock.activeTimerCount(), 0);
  child.stdout.write(
    '{"status":"stage","stage":"http_listening","elapsedMs":520}\n',
  );
  clock.advance(1_000);
  assert.equal(clock.activeTimerCount(), 0);
  child.close();
});

test("a stuck fixture stage fails after the inactivity timeout", async () => {
  const child = new FakeChild();
  const clock = createFakeClock();
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 180,
    hardStartupTimeoutMs: 600,
    parseReadyLine: () => undefined,
    forwardStdout: () => undefined,
    forwardStderr: () => undefined,
    ...clock,
  });
  child.stdout.write(
    '{"status":"stage","stage":"module_runtime_entry","elapsedMs":0}\n',
  );
  clock.advance(100);
  child.stdout.write(
    '{"status":"stage","stage":"prisma_db_push_start","elapsedMs":95}\n',
  );
  child.stdout.write(
    '{"status":"stage","stage":"unknown","elapsedMs":96,"payload":"stdout-sentinel-secret"}\n',
  );
  child.stderr.write("token=stderr-sentinel-secret\nvisible failure context\n");
  clock.advance(180);
  await assert.rejects(ready, (error) => {
    assert.match(error.message, /no valid startup progress for 180ms/u);
    assert.match(error.message, /Last observed fixture stage: prisma_db_push_start/u);
    assert.match(error.message, /fixture elapsed=95ms/u);
    assert.match(error.message, /stage age=180ms/u);
    assert.match(error.message, /stdout tail \(redacted\)/u);
    assert.match(error.message, /stderr tail \(redacted\)/u);
    assert.match(error.message, /ignored non-protocol fixture stdout record/u);
    assert.match(error.message, /visible failure context/u);
    assert.match(error.message, /token=\[REDACTED\]/u);
    assert.doesNotMatch(
      error.message,
      /stdout-sentinel-secret|stderr-sentinel-secret/u,
    );
    assert.ok(Buffer.byteLength(error.message, "utf8") < 34_000);
    return true;
  });
  child.close();
});

test("invalid and non-monotonic stage noise cannot extend inactivity", async () => {
  const child = new FakeChild();
  const clock = createFakeClock();
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 180,
    hardStartupTimeoutMs: 600,
    parseReadyLine: () => undefined,
    forwardStdout: () => undefined,
    forwardStderr: () => undefined,
    ...clock,
  });
  child.stdout.write(
    '{"status":"stage","stage":"prisma_db_push_start","elapsedMs":0}\n',
  );
  for (const noise of [
    '{"status":"stage","stage":"prisma_db_push_start","elapsedMs":45}',
    '{"status":"stage","stage":"unknown","elapsedMs":90}',
    '{"status":"stage","stage":"pglite_socket_start","elapsedMs":135}',
    '{"status":"stage","stage":"prisma_db_push_end","elapsedMs":"179"}',
  ]) {
    clock.advance(45);
    child.stdout.write(`${noise}\n`);
  }
  await assert.rejects(ready, /no valid startup progress for 180ms/u);
  assert.equal(clock.activeTimerCount(), 0);
  child.close();
});

test("late valid progress cannot bypass an expired inactivity deadline", async () => {
  const child = new FakeChild();
  const clock = createFakeClock();
  let stdout = "";
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 180,
    hardStartupTimeoutMs: 600,
    parseReadyLine: () => undefined,
    forwardStdout: (chunk) => {
      stdout += chunk;
    },
    forwardStderr: () => undefined,
    ...clock,
  });
  child.stdout.write(
    '{"status":"stage","stage":"module_runtime_entry","elapsedMs":0}\n',
  );
  clock.advanceWithoutTimers(181);
  child.stdout.write(
    '{"status":"stage","stage":"pglite_construction_start","elapsedMs":181}\n',
  );
  await assert.rejects(ready, (error) => {
    assert.match(error.message, /no valid startup progress for 180ms/u);
    assert.match(error.message, /Last observed fixture stage: module_runtime_entry/u);
    assert.match(error.message, /stage age=181ms/u);
    return true;
  });
  assert.doesNotMatch(stdout, /pglite_construction_start/u);
  assert.equal(clock.activeTimerCount(), 0);
  child.close();
});

test("late valid readiness cannot bypass the hard startup deadline", async () => {
  const child = new FakeChild();
  const clock = createFakeClock();
  let stdout = "";
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 180,
    hardStartupTimeoutMs: 200,
    parseReadyLine: (line) => {
      const record = JSON.parse(line);
      return record.status === "ready" ? record.baseUrl : undefined;
    },
    forwardStdout: (chunk) => {
      stdout += chunk;
    },
    forwardStderr: () => undefined,
    ...clock,
  });
  child.stdout.write(
    '{"status":"stage","stage":"module_runtime_entry","elapsedMs":0}\n',
  );
  clock.advanceWithoutTimers(100);
  child.stdout.write(
    '{"status":"stage","stage":"pglite_construction_start","elapsedMs":100}\n',
  );
  clock.advanceWithoutTimers(101);
  child.stdout.write(
    '{"status":"ready","baseUrl":"http://127.0.0.1:1234"}\n',
  );
  await assert.rejects(ready, (error) => {
    assert.match(error.message, /hard startup cap of 200ms/u);
    assert.match(error.message, /Last observed fixture stage: pglite_construction_start/u);
    assert.match(error.message, /stage age=101ms/u);
    return true;
  });
  assert.doesNotMatch(stdout, /"status":"ready"/u);
  assert.equal(clock.activeTimerCount(), 0);
  child.close();
});

test("hard startup cap terminates endless valid progress without leaking secrets", async () => {
  const child = new FakeChild();
  const clock = createFakeClock();
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 70,
    hardStartupTimeoutMs: 200,
    parseReadyLine: () => undefined,
    forwardStdout: () => undefined,
    forwardStderr: () => undefined,
    ...clock,
  });
  child.stderr.write("authorization=private-hard-cap-secret\n");
  const stages = [
    "module_runtime_entry",
    "pglite_construction_start",
    "pglite_construction_end",
    "pglite_socket_start",
  ];
  for (const [index, stage] of stages.entries()) {
    if (index > 0) clock.advance(60);
    child.stdout.write(
      `${JSON.stringify({ status: "stage", stage, elapsedMs: clock.now() })}\n`,
    );
  }
  child.stdout.write(
    '{"status":"stage","stage":"unknown","elapsedMs":181,"payload":"private-stdout-secret"}\n',
  );
  clock.advance(20);
  await assert.rejects(ready, (error) => {
    assert.match(error.message, /hard startup cap of 200ms/u);
    assert.match(error.message, /Last observed fixture stage: pglite_socket_start/u);
    assert.match(error.message, /stage age=20ms/u);
    assert.match(error.message, /authorization=\[REDACTED\]/u);
    assert.doesNotMatch(
      error.message,
      /private-hard-cap-secret|private-stdout-secret/u,
    );
    return true;
  });
  assert.equal(clock.activeTimerCount(), 0);
  child.close();
});

test("an early hard-cap timer fire is rescheduled to the monotonic deadline", async () => {
  const child = new FakeChild();
  const clock = createFakeClock();
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 500,
    hardStartupTimeoutMs: 200.5,
    parseReadyLine: () => undefined,
    forwardStdout: () => undefined,
    forwardStderr: () => undefined,
    ...clock,
  });
  clock.fireNextTimerEarly(0.5);
  assert.equal(clock.now(), 200);
  assert.equal(clock.activeTimerCount(), 2);
  clock.advance(1);
  await assert.rejects(ready, /hard startup cap of 200.5ms/u);
  assert.equal(clock.activeTimerCount(), 0);
  child.close();
});

test("fixture exit before readiness includes only redacted stderr", async () => {
  const child = new FakeChild();
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 1_000,
    hardStartupTimeoutMs: 2_000,
    parseReadyLine: () => undefined,
    forwardStdout: () => undefined,
    forwardStderr: () => undefined,
  });
  child.stdout.write(
    '{"status":"stage","stage":"nest_module_compile_start","elapsedMs":30}\n',
  );
  child.stderr.write("password=private-password\n");
  child.close(2);
  await assert.rejects(ready, (error) => {
    assert.match(error.message, /code=2/u);
    assert.match(error.message, /password=\[REDACTED\]/u);
    assert.match(error.message, /Last observed fixture stage: nest_module_compile_start/u);
    assert.match(error.message, /stdout tail \(redacted\)/u);
    assert.match(error.message, /stderr tail \(redacted\)/u);
    assert.doesNotMatch(error.message, /private-password/u);
    return true;
  });
});

test("invalid fixture readiness rejects through the lifecycle boundary", async () => {
  const child = new FakeChild();
  const ready = waitForReaderSummaryFixture({
    child,
    inactivityTimeoutMs: 1_000,
    hardStartupTimeoutMs: 2_000,
    parseReadyLine: () => {
      throw new Error("external fixture URL rejected");
    },
    forwardStdout: () => undefined,
    forwardStderr: () => undefined,
  });
  child.stdout.write("invalid ready record\n");
  await assert.rejects(ready, /invalid readiness record/u);
  child.close();
});
