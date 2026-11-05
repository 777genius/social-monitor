import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, resolve } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { setImmediate } from "node:timers";
import { fileURLToPath } from "node:url";

import {
  buildReaderSummaryFlutterDriveArgs,
  executeReaderSummaryChromeRunner,
  forwardRedactedReaderSummaryOutput,
  runReaderSummaryChromeDrive,
  startReaderSummaryChromeDriverWithRetry,
} from "../run-reader-summary-http-chrome-e2e.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

class FakeChild extends EventEmitter {
  constructor() {
    super();
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

test("Flutter Drive uses unsafe SwiftShader only in its hermetic E2E browser args", () => {
  const args = buildReaderSummaryFlutterDriveArgs({
    prefixArgs: ["flutter"],
    driverPort: 4444,
    chromeExecutable: "/tools/chrome",
    driveTimeoutSeconds: 900,
    baseUrl: "http://127.0.0.1:4321",
    browserLogPath: "/tmp/e2e/browser.log",
    browserUserData: "/tmp/e2e/profile",
  });
  assert.deepEqual(args, [
    "flutter",
    "drive",
    "--driver=test_driver/integration_test.dart",
    "--target=integration_test/reader_summary_http_drive_test.dart",
    "-d",
    "web-server",
    "--web-hostname=127.0.0.1",
    "--driver-port=4444",
    "--browser-name=chrome",
    "--chrome-binary=/tools/chrome",
    "--browser-dimension=1200x900@1",
    "--timeout=900",
    "--headless",
    "--dart-define=READER_SUMMARY_HTTP_FIXTURE_BASE_URL=http://127.0.0.1:4321",
    "--web-browser-flag=--enable-logging",
    "--web-browser-flag=--log-level=0",
    "--web-browser-flag=--log-file=/tmp/e2e/browser.log",
    "--web-browser-flag=--user-data-dir=/tmp/e2e/profile",
    "--web-browser-flag=--enable-unsafe-swiftshader",
  ]);
  assert.equal(
    args.filter(
      (argument) =>
        argument === "--web-browser-flag=--enable-unsafe-swiftshader",
    ).length,
    1,
  );
  assert.equal(
    args.filter((argument) => argument.includes("unsafe-swiftshader")).length,
    1,
  );
});

test("ChromeDriver retries only bounded address-in-use startup failures", async () => {
  const ports = [4101, 4102];
  let launches = 0;
  const result = await startReaderSummaryChromeDriverWithRetry({
    reservePort: async () => ports.shift(),
    launch: (port) => {
      launches += 1;
      return {
        child: { port },
        transcript: {
          stdout: "",
          stderr: launches === 1 ? "bind() failed: Address already in use (98)" : "",
        },
      };
    },
    waitForReady: async () => {
      if (launches === 1) throw new Error("ChromeDriver exited before readiness");
    },
  });
  assert.equal(result.port, 4102);
  assert.equal(launches, 2);
});

test("ChromeDriver never retries a non-address startup failure", async () => {
  let launches = 0;
  await assert.rejects(
    startReaderSummaryChromeDriverWithRetry({
      reservePort: async () => 4101,
      launch: () => {
        launches += 1;
        return { child: {}, transcript: { stdout: "", stderr: "bad flags" } };
      },
      waitForReady: async () => { throw new Error("invalid argument"); },
    }),
    /invalid argument/u,
  );
  assert.equal(launches, 1);
});

test("Flutter Drive accepts only an explicit passing integration result", async () => {
  const child = new FakeChild();
  await runReaderSummaryChromeDrive({
    supervisor: { spawn: () => child },
    flutterExecutable: "flutter",
    flutterArgs: [],
    cwd: "/work",
    environment: {},
    browserLogPath: "/missing/browser.log",
    chromeDriverLogPath: "/missing/driver.log",
    phaseTimeoutMs: 1_000,
    forwardOutput: (_child, { onStdout }) => {
      onStdout("All tests passed.\n");
      setImmediate(() => child.close(0));
      return { stdout: "All tests passed.\n", stderr: "" };
    },
  });
});

test("Flutter Drive accepts terminal success followed by an immediate normal exit", async () => {
  const child = new FakeChild();
  await runReaderSummaryChromeDrive({
    supervisor: { spawn: () => child },
    flutterExecutable: "flutter",
    flutterArgs: [],
    cwd: "/work",
    environment: {},
    browserLogPath: "/missing/browser.log",
    chromeDriverLogPath: "/missing/driver.log",
    phaseTimeoutMs: 1_000,
    forwardOutput: (_child, { onStdout }) => {
      onStdout("All tests passed.\n");
      child.close(0);
      return { stdout: "All tests passed.\n", stderr: "" };
    },
  });
});

test("Flutter Drive rejects terminal success when the process does not exit", async () => {
  const child = new FakeChild();
  let terminated = false;
  await assert.rejects(
    runReaderSummaryChromeDrive({
      supervisor: {
        spawn: () => child,
        terminate: async () => {
          terminated = true;
          child.close(null, "SIGTERM");
        },
      },
      flutterExecutable: "flutter",
      flutterArgs: [],
      cwd: "/work",
      environment: {},
      browserLogPath: "/missing/browser.log",
      chromeDriverLogPath: "/missing/driver.log",
      phaseTimeoutMs: 1_000,
      terminalExitGraceMs: 2,
      forwardOutput: (_child, { onStdout }) => {
        onStdout("All tests passed.\n");
        return { stdout: "All tests passed.\n", stderr: "" };
      },
      forwardStderr: () => undefined,
    }),
    /reported success but did not exit normally/u,
  );
  assert.equal(terminated, true);
});

test("Flutter Drive clears its phase timer after early success", async () => {
  const child = new FakeChild();
  const timer = { unref: () => undefined };
  const cleared = [];
  await runReaderSummaryChromeDrive({
    supervisor: { spawn: () => child },
    flutterExecutable: "flutter",
    flutterArgs: [],
    cwd: "/work",
    environment: {},
    browserLogPath: "/missing/browser.log",
    chromeDriverLogPath: "/missing/driver.log",
    phaseTimeoutMs: 1_000,
    forwardOutput: (_child, { onStdout }) => {
      onStdout("All tests passed.\n");
      setImmediate(() => child.close(0));
      return { stdout: "All tests passed.\n", stderr: "" };
    },
    setTimer: () => timer,
    clearTimer: (handle) => cleared.push(handle),
  });
  assert.deepEqual(cleared, [timer]);
});

test("Flutter Drive rejects a signal exit after terminal success", async () => {
  const child = new FakeChild();
  await assert.rejects(
    runReaderSummaryChromeDrive({
      supervisor: { spawn: () => child },
      flutterExecutable: "flutter",
      flutterArgs: [],
      cwd: "/work",
      environment: {},
      browserLogPath: "/missing/browser.log",
      chromeDriverLogPath: "/missing/driver.log",
      phaseTimeoutMs: 1_000,
      forwardOutput: (_child, { onStdout }) => {
        onStdout("All tests passed.\n");
        setImmediate(() => child.close(null, "SIGTERM"));
        return { stdout: "All tests passed.\n", stderr: "" };
      },
      forwardStderr: () => undefined,
    }),
    /failed after terminal success \(code=null, signal=SIGTERM\)/u,
  );
});

test("Flutter Drive rejects code zero without a terminal integration result", async () => {
  const child = new FakeChild();
  const diagnostics = [];
  const execution = runReaderSummaryChromeDrive({
    supervisor: { spawn: () => child },
    flutterExecutable: "flutter",
    flutterArgs: [],
    cwd: "/work",
    environment: {},
    browserLogPath: "/missing/browser.log",
    chromeDriverLogPath: "/missing/driver.log",
    phaseTimeoutMs: 1_000,
    forwardOutput: () => ({ stdout: "tool exited\n", stderr: "" }),
    forwardStderr: (value) => diagnostics.push(value),
  });
  child.close(0);
  await assert.rejects(execution, /without a terminal integration result/u);
  assert.match(diagnostics.join(""), /Flutter stdout tail/u);
  assert.match(diagnostics.join(""), /Diagnostic log is unavailable/u);
});

test("Flutter Drive phase timeout terminates its process group", async () => {
  const child = new FakeChild();
  let terminated = false;
  await assert.rejects(
    runReaderSummaryChromeDrive({
      supervisor: {
        spawn: () => child,
        terminate: async () => {
          terminated = true;
          child.close(null, "SIGTERM");
        },
      },
      flutterExecutable: "flutter",
      flutterArgs: [],
      cwd: "/work",
      environment: {},
      browserLogPath: "/missing/browser.log",
      chromeDriverLogPath: "/missing/driver.log",
      phaseTimeoutMs: 5,
      forwardOutput: () => ({ stdout: "", stderr: "" }),
      forwardStderr: () => undefined,
    }),
    /phase timed out/u,
  );
  assert.equal(terminated, true);
});

test("stdout and stderr records are observed and retained independently", async () => {
  const child = new FakeChild();
  const observed = { stdout: "", stderr: "" };
  const forwarded = { stdout: "", stderr: "" };
  const transcript = forwardRedactedReaderSummaryOutput(child, {
    onStdout: (safe) => {
      observed.stdout += safe;
    },
    onStderr: (safe) => {
      observed.stderr += safe;
    },
    forwardStdout: (safe) => {
      forwarded.stdout += safe;
    },
    forwardStderr: (safe) => {
      forwarded.stderr += safe;
    },
  });
  child.stdout.write("stdout-record\n");
  child.stderr.write("stderr-record token=private\n");
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  child.close();
  assert.equal(observed.stdout, "stdout-record\n");
  assert.equal(observed.stderr, "stderr-record token=[REDACTED]\n");
  assert.equal(forwarded.stdout, observed.stdout);
  assert.equal(forwarded.stderr, observed.stderr);
  assert.equal(transcript.stdout, observed.stdout);
  assert.equal(transcript.stderr, observed.stderr);
});

test("runner outer timeout returns 124 and cleans up", async () => {
  const events = [];
  const exitCode = await executeReaderSummaryChromeRunner({
    runHarness: () => new Promise(() => undefined),
    cleanup: async () => {
      events.push("cleanup");
    },
    totalTimeoutMs: 5,
    forwardStderr: (value) => events.push(value),
  });
  assert.equal(exitCode, 124);
  assert.match(events[0], /timed out after 5ms/u);
  assert.equal(events[1], "cleanup");
});

test("delayed outer timer cannot let post-deadline success win", async () => {
  const events = [];
  let monotonicTime = 10;
  let finishHarness;
  const harness = new Promise((resolveHarness) => {
    finishHarness = resolveHarness;
  });
  const execution = executeReaderSummaryChromeRunner({
    runHarness: () => harness,
    cleanup: async () => {
      events.push("cleanup");
    },
    totalTimeoutMs: 50,
    forwardStderr: (value) => events.push(value),
    now: () => monotonicTime,
    setTimer: () => ({ unref: () => undefined }),
    clearTimer: () => undefined,
  });
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  monotonicTime = 61;
  finishHarness();
  assert.equal(await execution, 124);
  assert.match(events[0], /timed out after 50ms/u);
  assert.equal(events[1], "cleanup");
});

test("runner exposes fixture startup's remaining total timeout budget", async () => {
  let monotonicTime = 100;
  const exitCode = await executeReaderSummaryChromeRunner({
    runHarness: async ({ remainingTimeoutMs }) => {
      assert.equal(remainingTimeoutMs(), 500);
      monotonicTime = 225;
      assert.equal(remainingTimeoutMs(), 375);
    },
    cleanup: async () => undefined,
    totalTimeoutMs: 500,
    now: () => monotonicTime,
    setTimer: () => ({ unref: () => undefined }),
    clearTimer: () => undefined,
  });
  assert.equal(exitCode, 0);
});

test("production entrypoint reaches fail-fast tool validation after creating its browser run", () => {
  const missingFlutter = resolve(
    repositoryRoot,
    "scripts/missing-reader-summary-flutter",
  );
  const execution = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, "scripts/run-reader-summary-http-chrome-e2e.mjs")],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        READER_SUMMARY_E2E_PLATFORM: "chrome",
        READER_SUMMARY_E2E_CHROMEDRIVER_EXECUTABLE: missingFlutter,
        READER_SUMMARY_E2E_FLUTTER_EXECUTABLE: missingFlutter,
        READER_SUMMARY_E2E_TOTAL_TIMEOUT_MS: "1200000",
        READER_SUMMARY_E2E_DRIVE_TIMEOUT_SECONDS: "900",
      },
      timeout: 15_000,
    },
  );
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /Flutter executable/u);
  assert.doesNotMatch(execution.stderr, /Cannot read properties of undefined/u);
  assert.doesNotMatch(execution.stdout, /fixture status=ready/u);
});
