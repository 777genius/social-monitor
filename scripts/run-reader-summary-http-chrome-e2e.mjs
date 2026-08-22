import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  createReaderSummaryBrowserRun,
  readerSummaryFlutterEnvironment,
  readReaderSummaryChromeConfig,
  removeReaderSummaryBrowserRun,
  requireCompatibleReaderSummaryBrowserVersions,
  resolveReaderSummaryExecutable,
  resolveReaderSummaryFlutterCommand,
  resolveReaderSummaryFlutterSdkRoot,
  verifyReaderSummaryChrome,
  verifyReaderSummaryChromeDriver,
  verifyReaderSummaryFlutter,
} from "./lib/reader-summary-chrome-runtime.mjs";
import {
  ReaderSummaryDiagnosticRedactor,
  redactReaderSummaryDiagnostic,
} from "./lib/reader-summary-e2e-diagnostics.mjs";
import {
  parseReaderSummaryFixtureReadyLine,
  probeReaderSummaryFixture,
  readerSummaryFixtureEnvironment,
} from "./lib/reader-summary-http-fixture-contract.mjs";
import { ensureReaderSummaryPrismaClient } from "./lib/reader-summary-prisma-client-preflight.mjs";
import {
  ReaderSummaryChildSupervisor,
  createReaderSummaryIntegrationResultObserver,
  emitReaderSummaryDriveDiagnostics,
  parseReaderSummaryFixtureStageLine,
  waitForReaderSummaryChild,
  waitForReaderSummaryChildWithTimeout,
  waitForReaderSummaryFixture,
} from "./lib/reader-summary-process-lifecycle.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendDirectory = resolve(repositoryRoot, "apps/frontend");
const appDirectory = resolve(frontendDirectory, "app");
const execFileAsync = promisify(execFile);
// R211 observed module_runtime_entry exceeding the former 180-second window.
const fixtureStartupInactivityTimeoutMs = 300_000;
const fixtureStartupHardCapMs = 600_000;
const chromeDriverStartupTimeoutMs = 30_000;
const terminalGraceMs = 10_000;

const boundedTranscript = (value) => String(value).slice(-16_384);

export const buildReaderSummaryFlutterDriveArgs = ({
  prefixArgs,
  driverPort,
  chromeExecutable,
  driveTimeoutSeconds,
  baseUrl,
  browserLogPath,
  browserUserData,
}) => [
  ...prefixArgs,
  "drive",
  "--driver=test_driver/integration_test.dart",
  "--target=integration_test/reader_summary_http_drive_test.dart",
  "-d",
  "web-server",
  "--web-hostname=127.0.0.1",
  `--driver-port=${driverPort}`,
  "--browser-name=chrome",
  `--chrome-binary=${chromeExecutable}`,
  "--browser-dimension=1200x900@1",
  `--timeout=${driveTimeoutSeconds}`,
  "--headless",
  `--dart-define=READER_SUMMARY_HTTP_FIXTURE_BASE_URL=${baseUrl}`,
  "--web-browser-flag=--enable-logging",
  "--web-browser-flag=--log-level=0",
  `--web-browser-flag=--log-file=${browserLogPath}`,
  `--web-browser-flag=--user-data-dir=${browserUserData}`,
  // Unsafe SwiftShader is restricted to this disposable, trusted E2E profile.
  "--web-browser-flag=--enable-unsafe-swiftshader",
];

export const forwardRedactedReaderSummaryOutput = (
  child,
  {
    onStdout = () => undefined,
    onStderr = () => undefined,
    forwardStdout = (safe) => process.stdout.write(safe),
    forwardStderr = (safe) => process.stderr.write(safe),
  } = {},
) => {
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  const transcript = { stdout: "", stderr: "" };
  const stdout = new ReaderSummaryDiagnosticRedactor({
    forward: (safe) => {
      transcript.stdout = boundedTranscript(`${transcript.stdout}${safe}`);
      onStdout(safe);
      forwardStdout(safe);
    },
  });
  const stderr = new ReaderSummaryDiagnosticRedactor({
    forward: (safe) => {
      transcript.stderr = boundedTranscript(`${transcript.stderr}${safe}`);
      onStderr(safe);
      forwardStderr(safe);
    },
  });
  child.stdout.on("data", (chunk) => stdout.write(chunk));
  child.stderr.on("data", (chunk) => stderr.write(chunk));
  child.once("close", () => {
    stdout.flush();
    stderr.flush();
  });
  return transcript;
};

const emitTranscript = (transcript, forward) => {
  if (transcript.stdout !== "") {
    forward(
      `[reader-summary-e2e] Flutter stdout tail (redacted):\n${transcript.stdout}\n`,
    );
  }
  if (transcript.stderr !== "") {
    forward(
      `[reader-summary-e2e] Flutter stderr tail (redacted):\n${transcript.stderr}\n`,
    );
  }
};

export const runReaderSummaryChromeDrive = async ({
  supervisor,
  flutterExecutable,
  flutterArgs,
  cwd,
  environment,
  browserLogPath,
  chromeDriverLogPath,
  phaseTimeoutMs,
  terminalExitGraceMs = terminalGraceMs,
  forwardOutput = forwardRedactedReaderSummaryOutput,
  forwardStderr = (diagnostic) => process.stderr.write(diagnostic),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) => {
  const drive = supervisor.spawn(flutterExecutable, flutterArgs, {
    cwd,
    env: environment,
  });
  const observer = createReaderSummaryIntegrationResultObserver();
  const terminalResult = observer.result.then((terminal) => ({ terminal }));
  const transcript = forwardOutput(drive, {
    onStdout: observer.observeStdout,
  });
  const childResult = waitForReaderSummaryChild(drive).then((result) => ({
    result,
  }));
  let phaseTimer;
  const phaseTimeout = new Promise((resolveTimeout) => {
    phaseTimer = setTimer(
      () => resolveTimeout({ timedOut: true, phase: "flutter-drive" }),
      phaseTimeoutMs,
    );
    phaseTimer.unref?.();
  });
  let outcome;
  try {
    outcome = await Promise.race([
      terminalResult,
      childResult,
      phaseTimeout,
    ]);
    if (outcome.timedOut) {
      await supervisor.terminate(drive);
      throw new Error(
        `Reader summary Flutter Drive phase timed out after ${phaseTimeoutMs}ms`,
      );
    }
    if (outcome.terminal !== undefined) {
      const close = await waitForReaderSummaryChildWithTimeout(
        drive,
        terminalExitGraceMs,
      );
      if (!outcome.terminal.passed) {
        if (close.timedOut) await supervisor.terminate(drive);
        throw new Error("Reader summary integration test reported failure");
      }
      if (close.timedOut) {
        await supervisor.terminate(drive);
        throw new Error(
          `Reader summary Flutter Drive reported success but did not exit normally within ${terminalExitGraceMs}ms`,
        );
      }
      if (close.result.code !== 0 || close.result.signal !== null) {
        throw new Error(
          `Reader summary Flutter Drive failed after terminal success (code=${close.result.code}, signal=${close.result.signal})`,
        );
      }
      return;
    }
    if (outcome.result.code !== 0) {
      throw new Error(
        `Reader summary Flutter Drive failed (code=${outcome.result.code}, signal=${outcome.result.signal})`,
      );
    }
    throw new Error(
      "Reader summary Flutter Drive exited without a terminal integration result",
    );
  } catch (error) {
    emitTranscript(transcript, forwardStderr);
    await emitReaderSummaryDriveDiagnostics({
      browserLogPath,
      chromeDriverLogPath,
      forward: forwardStderr,
    });
    error.runtimeDiagnosticsEmitted = true;
    throw error;
  } finally {
    clearTimer(phaseTimer);
  }
};

const reserveLoopbackPort = async () => {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = address.port;
  await new Promise((resolveClose, reject) =>
    server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    }),
  );
  return port;
};

const waitForChromeDriver = async ({
  child,
  port,
  timeoutMs,
  request = fetch,
}) => {
  const deadline = Date.now() + timeoutMs;
  const exited = waitForReaderSummaryChild(child).then((result) => ({
    result,
  }));
  while (Date.now() < deadline) {
    const status = await Promise.race([
      exited,
      request(`http://127.0.0.1:${port}/status`, {
        signal: globalThis.AbortSignal.timeout(1_000),
      }).then(
        (response) => ({ ready: response.ok }),
        () => ({ ready: false }),
      ),
    ]);
    if (status.result !== undefined) {
      throw new Error(
        `ChromeDriver exited before readiness (code=${status.result.code}, signal=${status.result.signal})`,
      );
    }
    if (status.ready) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`ChromeDriver did not become ready within ${timeoutMs}ms`);
};

const resolveToolchain = async ({ config, browserRun }) => {
  const flutterCommand = await resolveReaderSummaryFlutterCommand({
    configured: config.flutterSetting,
    frontendDirectory,
    environment: browserRun.environment,
  });
  const chromeExecutable = await resolveReaderSummaryExecutable({
    configured: config.chromeSetting,
    defaults: ["google-chrome", "chromium", "chromium-browser"],
    label: "Chrome",
    environment: browserRun.environment,
  });
  const chromeDriverExecutable = await resolveReaderSummaryExecutable({
    configured: config.chromeDriverSetting,
    defaults: [],
    label: "ChromeDriver",
    environment: browserRun.environment,
  });
  const flutterSdkRoot =
    flutterCommand.prefixArgs.length === 0
      ? await resolveReaderSummaryFlutterSdkRoot({
          executable: flutterCommand.executable,
        })
      : undefined;
  const flutterEnvironment = readerSummaryFlutterEnvironment({
    environment: browserRun.environment,
    flutterSdkRoot,
  });
  const flutter = await verifyReaderSummaryFlutter({
    executable: flutterCommand.executable,
    prefixArgs: flutterCommand.prefixArgs,
    execute: execFileAsync,
    environment: flutterEnvironment,
    workingDirectory: frontendDirectory,
  });
  if (!/\bFlutter 3\.41\.9\b/u.test(flutter.version)) {
    throw new Error(
      `Reader summary E2E requires pinned Flutter 3.41.9, received ${JSON.stringify(flutter.version)}`,
    );
  }
  const chrome = await verifyReaderSummaryChrome({
    executable: chromeExecutable,
    execute: execFileAsync,
    environment: browserRun.environment,
  });
  const chromeDriver = await verifyReaderSummaryChromeDriver({
    executable: chromeDriverExecutable,
    execute: execFileAsync,
    environment: browserRun.environment,
  });
  const browserMajor = requireCompatibleReaderSummaryBrowserVersions({
    chromeVersion: chrome.version,
    chromeDriverVersion: chromeDriver.version,
  });
  process.stdout.write(
    `[reader-summary-e2e] platform=chrome flutter=${JSON.stringify(flutter.version)} chromeMajor=${browserMajor} chromedriverMajor=${browserMajor}\n`,
  );
  return {
    chromeDriverExecutable,
    chromeExecutable,
    flutterCommand,
    flutterEnvironment,
  };
};

const assertFixtureEntrypoints = async () => {
  const entries = [
    "node_modules/ts-node/dist/bin.js",
    "scripts/reader-summary-http-chrome-fixture-server.ts",
    "apps/frontend/app/integration_test/reader_summary_http_drive_test.dart",
    "apps/frontend/app/test_driver/integration_test.dart",
  ];
  for (const entry of entries) {
    try {
      await access(resolve(repositoryRoot, entry));
    } catch {
      throw new Error(
        `Reader summary Chrome E2E prerequisite is missing: ${entry}. Run npm ci and frontend pub get before retrying.`,
      );
    }
  }
};

const run = async ({ config, supervisor, browserRun, remainingTimeoutMs }) => {
  try {
    const toolchain = await resolveToolchain({ config, browserRun });
    await assertFixtureEntrypoints();
    await ensureReaderSummaryPrismaClient({
      repositoryRoot,
      execute: execFileAsync,
    });

    const fixture = supervisor.spawn(
      process.execPath,
      [
        resolve(repositoryRoot, "node_modules/ts-node/dist/bin.js"),
        "--transpile-only",
        "--compiler-options",
        '{"rootDir":"."}',
        "-r",
        "tsconfig-paths/register",
        resolve(
          repositoryRoot,
          "scripts/reader-summary-http-chrome-fixture-server.ts",
        ),
      ],
      {
        cwd: repositoryRoot,
        env: {
          ...readerSummaryFixtureEnvironment(browserRun.environment),
          HOME: browserRun.home,
          TEMP: browserRun.temporary,
          TMP: browserRun.temporary,
          TMPDIR: browserRun.temporary,
          XDG_CACHE_HOME: browserRun.xdgCache,
          XDG_CONFIG_HOME: browserRun.xdgConfig,
          XDG_DATA_HOME: browserRun.xdgData,
        },
      },
    );
    const baseUrl = await waitForReaderSummaryFixture({
      child: fixture,
      parseReadyLine: parseReaderSummaryFixtureReadyLine,
      parseStageLine: parseReaderSummaryFixtureStageLine,
      inactivityTimeoutMs: fixtureStartupInactivityTimeoutMs,
      hardStartupTimeoutMs: Math.min(
        fixtureStartupHardCapMs,
        Math.max(0, Math.floor(remainingTimeoutMs())),
      ),
    });
    await probeReaderSummaryFixture({ baseUrl });
    process.stdout.write(
      `[reader-summary-e2e] fixture status=ready route="GET /reader-summaries" baseUrl=${JSON.stringify(baseUrl)}\n`,
    );

    const driverPort = await reserveLoopbackPort();
    const chromeDriver = supervisor.spawn(
      toolchain.chromeDriverExecutable,
      [
        `--port=${driverPort}`,
        "--allowed-ips=127.0.0.1,::1",
        `--log-path=${browserRun.chromeDriverLogPath}`,
        "--verbose",
      ],
      {
        cwd: appDirectory,
        env: browserRun.environment,
      },
    );
    forwardRedactedReaderSummaryOutput(chromeDriver);
    await waitForChromeDriver({
      child: chromeDriver,
      port: driverPort,
      timeoutMs: chromeDriverStartupTimeoutMs,
    });
    process.stdout.write(
      `[reader-summary-e2e] chromedriver status=ready host=127.0.0.1 port=${driverPort}\n`,
    );

    const flutterArgs = buildReaderSummaryFlutterDriveArgs({
      prefixArgs: toolchain.flutterCommand.prefixArgs,
      driverPort,
      chromeExecutable: toolchain.chromeExecutable,
      driveTimeoutSeconds: config.driveTimeoutSeconds,
      baseUrl,
      browserLogPath: browserRun.browserLogPath,
      browserUserData: browserRun.userData,
    });
    await runReaderSummaryChromeDrive({
      supervisor,
      flutterExecutable: toolchain.flutterCommand.executable,
      flutterArgs,
      cwd: appDirectory,
      environment: toolchain.flutterEnvironment,
      browserLogPath: browserRun.browserLogPath,
      chromeDriverLogPath: browserRun.chromeDriverLogPath,
      phaseTimeoutMs: (config.driveTimeoutSeconds + 60) * 1_000,
    });
  } catch (error) {
    if (!error.runtimeDiagnosticsEmitted) {
      await emitReaderSummaryDriveDiagnostics({
        browserLogPath: browserRun.browserLogPath,
        chromeDriverLogPath: browserRun.chromeDriverLogPath,
      });
      error.runtimeDiagnosticsEmitted = true;
    }
    throw error;
  }
};

export const executeReaderSummaryChromeRunner = async ({
  runHarness,
  cleanup,
  totalTimeoutMs,
  registerTerminationSignals = () => undefined,
  forwardStderr = (diagnostic) => process.stderr.write(diagnostic),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => performance.now(),
}) => {
  const deadline = now() + totalTimeoutMs;
  const timeoutOutcome = () => ({
    exitCode: 124,
    message: `Reader summary Chrome E2E timed out after ${totalTimeoutMs}ms; cleaning every child process group`,
    terminated: true,
  });
  let requestTermination;
  const termination = new Promise((resolveTermination) => {
    let requested = false;
    requestTermination = (exitCode, message) => {
      if (requested) return;
      requested = true;
      resolveTermination({ exitCode, message, terminated: true });
    };
  });
  registerTerminationSignals(requestTermination);
  const timer = setTimer(
    () =>
      requestTermination(timeoutOutcome().exitCode, timeoutOutcome().message),
    totalTimeoutMs,
  );
  timer.unref?.();
  const completed = Promise.resolve()
    .then(() =>
      runHarness({
        remainingTimeoutMs: () => Math.max(0, deadline - now()),
      }),
    )
    .then(
      () => ({ completed: true, exitCode: 0 }),
      (error) => ({ completed: true, error, exitCode: 1 }),
    );
  let outcome = await Promise.race([completed, termination]);
  if (outcome.completed && now() >= deadline) outcome = timeoutOutcome();
  clearTimer(timer);
  if (outcome.message !== undefined) forwardStderr(`${outcome.message}\n`);
  if (outcome.error && !outcome.error.diagnosticAlreadyEmitted) {
    forwardStderr(
      `${redactReaderSummaryDiagnostic(outcome.error?.stack ?? outcome.error)}\n`,
    );
  }
  try {
    await cleanup();
  } catch (error) {
    forwardStderr(`${redactReaderSummaryDiagnostic(error?.stack ?? error)}\n`);
    if (outcome.exitCode === 0) return 1;
  }
  return outcome.exitCode;
};

const main = async () => {
  const config = readReaderSummaryChromeConfig();
  const supervisor = new ReaderSummaryChildSupervisor();
  let browserRun;
  const cleanup = async () => {
    await supervisor.cleanup();
    await removeReaderSummaryBrowserRun(browserRun?.runDirectory);
    browserRun = undefined;
  };
  return executeReaderSummaryChromeRunner({
    runHarness: async ({ remainingTimeoutMs }) => {
      browserRun = await createReaderSummaryBrowserRun();
      await run({ config, supervisor, browserRun, remainingTimeoutMs });
    },
    cleanup,
    totalTimeoutMs: config.totalTimeoutMs,
    registerTerminationSignals: (terminate) => {
      for (const [signal, exitCode] of Object.entries({
        SIGINT: 130,
        SIGTERM: 143,
        SIGHUP: 129,
      })) {
        process.once(signal, () => terminate(exitCode));
      }
    },
  });
};

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const exitCode = await main();
  if ([124, 129, 130, 143].includes(exitCode)) process.exit(exitCode);
  process.exitCode = exitCode;
}
