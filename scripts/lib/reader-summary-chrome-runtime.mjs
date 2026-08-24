import { constants } from "node:fs";
import { access, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  resolve,
} from "node:path";

const defaultTotalTimeoutMs = 1_200_000;
const minimumTotalTimeoutMs = 600_000;
const maximumTotalTimeoutMs = 2_400_000;

const canonicalPositiveInteger = (
  setting,
  name,
  fallback,
  minimum,
  maximum,
) => {
  if (setting === undefined) return fallback;
  if (!/^[1-9][0-9]*$/u.test(setting)) {
    throw new Error(
      `${name} must be a canonical positive base-10 integer, received ${JSON.stringify(setting)}`,
    );
  }
  const value = Number(setting);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be between ${minimum} and ${maximum} inclusive, received ${setting}`,
    );
  }
  return value;
};

export const readReaderSummaryChromeConfig = (
  environment = process.env,
  runtimePlatform = process.platform,
) => {
  if (runtimePlatform === "win32") {
    throw new Error(
      "Reader summary Chrome E2E is POSIX-only; process-group termination is not implemented on Windows",
    );
  }
  const platform = environment.READER_SUMMARY_E2E_PLATFORM ?? "chrome";
  if (platform !== "chrome") {
    throw new Error(
      `READER_SUMMARY_E2E_PLATFORM must be chrome, received ${JSON.stringify(platform)}`,
    );
  }
  const chromeDriverSetting =
    environment.READER_SUMMARY_E2E_CHROMEDRIVER_EXECUTABLE;
  if (chromeDriverSetting === undefined || chromeDriverSetting.trim() === "") {
    throw new Error(
      "READER_SUMMARY_E2E_CHROMEDRIVER_EXECUTABLE must name the explicit compatible ChromeDriver executable",
    );
  }
  const totalTimeoutMs = canonicalPositiveInteger(
    environment.READER_SUMMARY_E2E_TOTAL_TIMEOUT_MS,
    "READER_SUMMARY_E2E_TOTAL_TIMEOUT_MS",
    defaultTotalTimeoutMs,
    minimumTotalTimeoutMs,
    maximumTotalTimeoutMs,
  );
  const driveTimeoutSeconds = canonicalPositiveInteger(
    environment.READER_SUMMARY_E2E_DRIVE_TIMEOUT_SECONDS,
    "READER_SUMMARY_E2E_DRIVE_TIMEOUT_SECONDS",
    900,
    600,
    1_800,
  );
  if (totalTimeoutMs < (driveTimeoutSeconds + 240) * 1_000) {
    throw new Error(
      "READER_SUMMARY_E2E_TOTAL_TIMEOUT_MS must reserve 240 seconds beyond the Flutter Drive phase",
    );
  }
  return {
    platform,
    totalTimeoutMs,
    driveTimeoutSeconds,
    flutterSetting: environment.READER_SUMMARY_E2E_FLUTTER_EXECUTABLE,
    chromeSetting:
      environment.READER_SUMMARY_E2E_CHROME_EXECUTABLE ??
      environment.CHROME_EXECUTABLE,
    chromeDriverSetting,
  };
};

export const resolveReaderSummaryExecutable = async ({
  configured,
  defaults,
  label,
  environment = process.env,
}) => {
  const candidates = configured === undefined ? defaults : [configured];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim() === "") continue;
    const paths =
      isAbsolute(candidate) || candidate.includes("/")
        ? [resolve(candidate)]
        : (environment.PATH ?? "")
            .split(delimiter)
            .filter(Boolean)
            .map((directory) => resolve(directory, candidate));
    for (const path of paths) {
      try {
        await access(path, constants.X_OK);
        return path;
      } catch {
        // Continue through explicit, FVM, and platform candidates.
      }
    }
  }
  const setting =
    configured === undefined ? "not found" : JSON.stringify(configured);
  throw new Error(
    `${label} executable ${setting}; set the corresponding READER_SUMMARY_E2E_*_EXECUTABLE variable to an executable file`,
  );
};

export const resolveReaderSummaryFlutterCommand = async ({
  configured,
  frontendDirectory,
  environment = process.env,
}) => {
  if (configured !== undefined) {
    return {
      executable: await resolveReaderSummaryExecutable({
        configured,
        defaults: [],
        label: "Flutter",
        environment,
      }),
      prefixArgs: [],
    };
  }
  try {
    return {
      executable: await resolveReaderSummaryExecutable({
        defaults: [resolve(frontendDirectory, ".fvm/flutter_sdk/bin/flutter")],
        label: "Flutter",
        environment,
      }),
      prefixArgs: [],
    };
  } catch {
    // A globally installed FVM is the portable fallback for this FVM workspace.
  }
  try {
    return {
      executable: await resolveReaderSummaryExecutable({
        defaults: ["fvm"],
        label: "FVM",
        environment,
      }),
      prefixArgs: ["flutter"],
    };
  } catch {
    return {
      executable: await resolveReaderSummaryExecutable({
        defaults: ["flutter"],
        label: "Flutter",
        environment,
      }),
      prefixArgs: [],
    };
  }
};

export const resolveReaderSummaryFlutterSdkRoot = async ({
  executable,
  resolveRealPath = realpath,
  accessPath = access,
}) => {
  const canonicalExecutable = await resolveRealPath(executable);
  const binDirectory = dirname(canonicalExecutable);
  const sdkRoot = dirname(binDirectory);
  if (
    basename(canonicalExecutable) !== "flutter" ||
    basename(binDirectory) !== "bin"
  ) {
    return undefined;
  }
  try {
    await Promise.all([
      accessPath(join(sdkRoot, ".git"), constants.R_OK),
      accessPath(
        join(sdkRoot, "packages/flutter_tools/pubspec.yaml"),
        constants.R_OK,
      ),
    ]);
  } catch {
    throw new Error(
      `Configured Flutter executable is not inside a validated Flutter SDK checkout: ${JSON.stringify(canonicalExecutable)}`,
    );
  }
  return sdkRoot;
};

const inheritedGitConfigCount = (environment) => {
  const setting = environment.GIT_CONFIG_COUNT;
  if (setting === undefined) return 0;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(setting)) {
    throw new Error(
      `Inherited GIT_CONFIG_COUNT must be a canonical non-negative integer, received ${JSON.stringify(setting)}`,
    );
  }
  const count = Number(setting);
  if (!Number.isSafeInteger(count)) {
    throw new Error(
      `Inherited GIT_CONFIG_COUNT must be a safe integer, received ${setting}`,
    );
  }
  return count;
};

export const readerSummaryFlutterEnvironment = ({
  environment = process.env,
  flutterSdkRoot,
}) => {
  if (flutterSdkRoot === undefined) return { ...environment };
  const index = inheritedGitConfigCount(environment);
  if (
    environment[`GIT_CONFIG_KEY_${index}`] !== undefined ||
    environment[`GIT_CONFIG_VALUE_${index}`] !== undefined
  ) {
    throw new Error(
      `Cannot append Flutter safe.directory without overwriting inherited Git command config at index ${index}`,
    );
  }
  return {
    ...environment,
    GIT_CONFIG_COUNT: String(index + 1),
    [`GIT_CONFIG_KEY_${index}`]: "safe.directory",
    [`GIT_CONFIG_VALUE_${index}`]: flutterSdkRoot,
  };
};

const verifyVersion = async ({
  executable,
  prefixArgs = [],
  execute,
  environment,
  workingDirectory,
  label,
  pattern,
}) => {
  const args = [...prefixArgs, "--version"];
  let result;
  try {
    result = await execute(executable, args, {
      env: environment,
      cwd: workingDirectory,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `Configured ${label} executable failed its version probe: ${error?.message ?? error}`,
    );
  }
  const stdout = String(result?.stdout ?? "").trim();
  const stderr = String(result?.stderr ?? "").trim();
  const stdoutRecords = stdout.split(/\r?\n/u).filter(Boolean);
  const stderrRecords = stderr.split(/\r?\n/u).filter(Boolean);
  const version =
    stdoutRecords.find((record) => pattern.test(record)) ??
    stderrRecords.find((record) => pattern.test(record)) ??
    "";
  if (version === "") {
    throw new Error(
      `Configured ${label} executable did not report ${label} on either output stream (stdout first record=${JSON.stringify(stdoutRecords[0] ?? "")}, stderr first record=${JSON.stringify(stderrRecords[0] ?? "")})`,
    );
  }
  return { args, version: version.replace(/\s+/gu, " ") };
};

export const verifyReaderSummaryFlutter = (input) =>
  verifyVersion({
    ...input,
    label: "Flutter",
    pattern: /\bFlutter\b/u,
  });

export const verifyReaderSummaryChrome = (input) =>
  verifyVersion({
    ...input,
    label: "Chrome",
    pattern: /\b(?:Google Chrome|Chromium)\b/u,
  });

export const verifyReaderSummaryChromeDriver = (input) =>
  verifyVersion({
    ...input,
    label: "ChromeDriver",
    pattern: /\bChromeDriver\b/u,
  });

const browserMajor = (version, label) => {
  const match = version.match(/\b([1-9][0-9]*)\.[0-9]+(?:\.[0-9]+){1,2}\b/u);
  if (match === null) {
    throw new Error(
      `${label} version has no parseable major: ${JSON.stringify(version)}`,
    );
  }
  return Number(match[1]);
};

export const requireCompatibleReaderSummaryBrowserVersions = ({
  chromeVersion,
  chromeDriverVersion,
}) => {
  const chromeMajor = browserMajor(chromeVersion, "Chrome");
  const chromeDriverMajor = browserMajor(chromeDriverVersion, "ChromeDriver");
  if (chromeMajor !== chromeDriverMajor) {
    throw new Error(
      `Chrome and ChromeDriver major versions must match (Chrome ${chromeMajor}, ChromeDriver ${chromeDriverMajor})`,
    );
  }
  return chromeMajor;
};

export const createReaderSummaryBrowserRun = async ({
  environment = process.env,
  temporaryRoot = tmpdir(),
} = {}) => {
  const runDirectory = await mkdtemp(
    join(resolve(temporaryRoot), "reader-summary-drive-"),
  );
  const paths = {
    browserLogPath: join(runDirectory, "chrome-browser.log"),
    chromeDriverLogPath: join(runDirectory, "chromedriver.log"),
    home: join(runDirectory, "home"),
    temporary: join(runDirectory, "tmp"),
    userData: join(runDirectory, "chrome-profile"),
    xdgCache: join(runDirectory, "xdg-cache"),
    xdgConfig: join(runDirectory, "xdg-config"),
    xdgData: join(runDirectory, "xdg-data"),
  };
  await Promise.all(
    Object.values(paths)
      .filter((path) => !path.endsWith(".log"))
      .map((path) => mkdir(path, { recursive: true })),
  );
  return {
    ...paths,
    runDirectory,
    environment: {
      ...environment,
      HOME: paths.home,
      TEMP: paths.temporary,
      TMP: paths.temporary,
      TMPDIR: paths.temporary,
      XDG_CACHE_HOME: paths.xdgCache,
      XDG_CONFIG_HOME: paths.xdgConfig,
      XDG_DATA_HOME: paths.xdgData,
    },
  };
};

export const removeReaderSummaryBrowserRun = async (runDirectory) => {
  if (runDirectory === undefined) return;
  await rm(runDirectory, { recursive: true, force: true });
};
