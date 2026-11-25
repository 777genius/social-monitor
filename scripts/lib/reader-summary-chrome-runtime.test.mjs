import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
} from "./reader-summary-chrome-runtime.mjs";

const baseEnvironment = {
  READER_SUMMARY_E2E_CHROMEDRIVER_EXECUTABLE: "/tools/chromedriver",
};

test("config requires Chrome and an explicit ChromeDriver contract", () => {
  const config = readReaderSummaryChromeConfig(baseEnvironment, "linux");
  assert.equal(config.platform, "chrome");
  assert.equal(config.chromeDriverSetting, "/tools/chromedriver");
  assert.equal(config.totalTimeoutMs, 1_200_000);
  assert.equal(config.driveTimeoutSeconds, 900);
  assert.throws(
    () => readReaderSummaryChromeConfig({}, "linux"),
    /CHROMEDRIVER_EXECUTABLE must name the explicit/u,
  );
  assert.throws(
    () =>
      readReaderSummaryChromeConfig(
        {
          ...baseEnvironment,
          READER_SUMMARY_E2E_PLATFORM: "firefox",
        },
        "linux",
      ),
    /must be chrome/u,
  );
  assert.throws(
    () => readReaderSummaryChromeConfig(baseEnvironment, "win32"),
    /POSIX-only/u,
  );
});

test("config validates total and phase timeout boundaries", () => {
  assert.equal(
    readReaderSummaryChromeConfig({
      ...baseEnvironment,
      READER_SUMMARY_E2E_TOTAL_TIMEOUT_MS: "2400000",
      READER_SUMMARY_E2E_DRIVE_TIMEOUT_SECONDS: "1800",
    }).driveTimeoutSeconds,
    1_800,
  );
  for (const value of ["", "0", "01", "599999", "2400001", "1.5"]) {
    assert.throws(
      () =>
        readReaderSummaryChromeConfig({
          ...baseEnvironment,
          READER_SUMMARY_E2E_TOTAL_TIMEOUT_MS: value,
        }),
      /TOTAL_TIMEOUT_MS/u,
    );
  }
  for (const value of ["599", "1801", "nine-hundred"]) {
    assert.throws(
      () =>
        readReaderSummaryChromeConfig({
          ...baseEnvironment,
          READER_SUMMARY_E2E_DRIVE_TIMEOUT_SECONDS: value,
        }),
      /DRIVE_TIMEOUT_SECONDS/u,
    );
  }
  assert.throws(
    () =>
      readReaderSummaryChromeConfig({
        ...baseEnvironment,
        READER_SUMMARY_E2E_TOTAL_TIMEOUT_MS: "600000",
        READER_SUMMARY_E2E_DRIVE_TIMEOUT_SECONDS: "600",
      }),
    /reserve 240 seconds/u,
  );
});

test("resolves configured and PATH executables", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-summary-tools-"));
  const executable = join(root, "tool");
  try {
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o700);
    assert.equal(
      await resolveReaderSummaryExecutable({
        configured: executable,
        defaults: [],
        label: "Tool",
        environment: {},
      }),
      executable,
    );
    assert.equal(
      await resolveReaderSummaryExecutable({
        defaults: ["tool"],
        label: "Tool",
        environment: { PATH: root },
      }),
      executable,
    );
    await assert.rejects(
      resolveReaderSummaryExecutable({
        configured: join(root, "missing"),
        defaults: [],
        label: "Tool",
        environment: {},
      }),
      /Tool executable/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Flutter discovery prefers the frontend FVM SDK then the fvm command", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-summary-fvm-"));
  const frontend = join(root, "apps", "frontend");
  const direct = join(frontend, ".fvm", "flutter_sdk", "bin", "flutter");
  const tools = join(root, "tools");
  const fvm = join(tools, "fvm");
  try {
    await mkdir(join(frontend, ".fvm", "flutter_sdk", "bin"), {
      recursive: true,
    });
    await mkdir(tools, { recursive: true });
    await writeFile(direct, "#!/bin/sh\nexit 0\n");
    await writeFile(fvm, "#!/bin/sh\nexit 0\n");
    await chmod(direct, 0o700);
    await chmod(fvm, 0o700);
    assert.deepEqual(
      await resolveReaderSummaryFlutterCommand({
        frontendDirectory: frontend,
        environment: { PATH: tools },
      }),
      { executable: direct, prefixArgs: [] },
    );
    await rm(join(frontend, ".fvm"), { recursive: true, force: true });
    assert.deepEqual(
      await resolveReaderSummaryFlutterCommand({
        frontendDirectory: frontend,
        environment: { PATH: tools },
      }),
      { executable: fvm, prefixArgs: ["flutter"] },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("derives and validates a Flutter SDK checkout root", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-summary-sdk-"));
  const sdk = join(root, "flutter");
  const executable = join(sdk, "bin", "flutter");
  try {
    await mkdir(join(sdk, "bin"), { recursive: true });
    await mkdir(join(sdk, ".git"));
    await mkdir(join(sdk, "packages", "flutter_tools"), { recursive: true });
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await writeFile(
      join(sdk, "packages", "flutter_tools", "pubspec.yaml"),
      "name: flutter_tools\n",
    );
    assert.equal(await resolveReaderSummaryFlutterSdkRoot({ executable }), sdk);
    assert.equal(
      await resolveReaderSummaryFlutterSdkRoot({
        executable: process.execPath,
      }),
      undefined,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("safe.directory is command-scoped and preserves inherited Git config", () => {
  const environment = readerSummaryFlutterEnvironment({
    environment: {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.sslVerify",
      GIT_CONFIG_VALUE_0: "true",
    },
    flutterSdkRoot: "/opt/flutter",
  });
  assert.equal(environment.GIT_CONFIG_COUNT, "2");
  assert.equal(environment.GIT_CONFIG_KEY_0, "http.sslVerify");
  assert.equal(environment.GIT_CONFIG_KEY_1, "safe.directory");
  assert.equal(environment.GIT_CONFIG_VALUE_1, "/opt/flutter");
  assert.throws(
    () =>
      readerSummaryFlutterEnvironment({
        environment: { GIT_CONFIG_COUNT: "0", GIT_CONFIG_KEY_0: "collision" },
        flutterSdkRoot: "/opt/flutter",
      }),
    /without overwriting/u,
  );
});

test("version probes never concatenate stdout and stderr records", async () => {
  const executions = [];
  const execute = async (executable, args, options) => {
    executions.push({ executable, args, options });
    if (executable === "flutter") {
      return {
        stdout: "Flutter 3.41.9 • channel stable\n",
        stderr: "warning\n",
      };
    }
    if (executable === "chrome") {
      return { stdout: "", stderr: "Google Chrome 140.0.7339.80\n" };
    }
    return { stdout: "ChromeDriver 140.0.7339.80\n", stderr: "" };
  };
  assert.match(
    (
      await verifyReaderSummaryFlutter({
        executable: "flutter",
        execute,
        environment: { SAFE: "1" },
        workingDirectory: "/frontend",
      })
    ).version,
    /^Flutter 3\.41\.9/u,
  );
  assert.match(
    (
      await verifyReaderSummaryChrome({
        executable: "chrome",
        execute,
        environment: {},
      })
    ).version,
    /^Google Chrome/u,
  );
  assert.match(
    (
      await verifyReaderSummaryChromeDriver({
        executable: "chromedriver",
        execute,
        environment: {},
      })
    ).version,
    /^ChromeDriver/u,
  );
  assert.equal(executions[0].options.env.SAFE, "1");
  assert.equal(executions[0].options.cwd, "/frontend");
});

test("requires equal Chrome and ChromeDriver major versions", () => {
  assert.equal(
    requireCompatibleReaderSummaryBrowserVersions({
      chromeVersion: "Google Chrome 140.0.7339.80",
      chromeDriverVersion: "ChromeDriver 140.0.7339.80",
    }),
    140,
  );
  assert.throws(
    () =>
      requireCompatibleReaderSummaryBrowserVersions({
        chromeVersion: "Google Chrome 140.0.7339.80",
        chromeDriverVersion: "ChromeDriver 139.0.7258.154",
      }),
    /major versions must match/u,
  );
});

test("browser run owns hermetic HOME TMP and XDG directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-summary-run-root-"));
  let run;
  try {
    run = await createReaderSummaryBrowserRun({
      environment: { PATH: "/tools", HOME: "/private/home" },
      temporaryRoot: root,
    });
    assert.match(run.runDirectory, /reader-summary-drive-/u);
    assert.equal(run.environment.HOME, run.home);
    assert.equal(run.environment.TEMP, run.temporary);
    assert.equal(run.environment.TMP, run.temporary);
    assert.equal(run.environment.TMPDIR, run.temporary);
    assert.equal(run.environment.XDG_CACHE_HOME, run.xdgCache);
    assert.equal(run.environment.XDG_CONFIG_HOME, run.xdgConfig);
    assert.equal(run.environment.XDG_DATA_HOME, run.xdgData);
    assert.notEqual(run.environment.HOME, "/private/home");
  } finally {
    await removeReaderSummaryBrowserRun(run?.runDirectory);
    await rm(root, { recursive: true, force: true });
  }
});

test("browser run resolves process defaults when invoked without arguments", async () => {
  let run;
  try {
    run = await createReaderSummaryBrowserRun();
    assert.equal(run.environment.PATH, process.env.PATH);
    assert.equal(run.environment.HOME, run.home);
    assert.equal(run.environment.TMPDIR, run.temporary);
    assert.match(run.runDirectory, /reader-summary-drive-/u);
  } finally {
    await removeReaderSummaryBrowserRun(run?.runDirectory);
  }
});
