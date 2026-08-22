import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import {
  ReaderSummaryDiagnosticRedactor,
  redactReaderSummaryDiagnostic,
} from "./reader-summary-e2e-diagnostics.mjs";

const defaultLogTailBytes = 16_384;
export const readerSummaryFixtureStartupStages = Object.freeze([
  "module_runtime_entry",
  "pglite_construction_start",
  "pglite_construction_end",
  "pglite_socket_start",
  "pglite_socket_started",
  "prisma_db_push_start",
  "prisma_db_push_end",
  "nest_module_compile_start",
  "nest_module_compile_end",
  "nest_app_create",
  "seeding_start",
  "seeding_end",
  "http_listen_start",
  "http_listening",
  "ready",
]);
const fixtureStartupStageIndex = new Map(
  readerSummaryFixtureStartupStages.map((stage, index) => [stage, index]),
);
// Browser diagnostics can contain terminal control sequences.
// eslint-disable-next-line no-control-regex
const ansiEscape = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/gu;
// Keep record separators and tabs while removing unsafe control bytes.
// eslint-disable-next-line no-control-regex
const diagnosticControl = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/gu;
const diagnosticPath =
  /(?:file:\/\/\/|[a-z]:[\\/]|\\\\|(?<![a-z0-9:/])\/{1,})[^\r\n]*/giu;

const exited = (child) => child.exitCode !== null || child.signalCode !== null;
const monotonicNow = () => performance.now();

export class ReaderSummaryChildSupervisor {
  #children = new Set();
  #groups = new Set();
  #cleanupPromise;
  #closing = false;

  constructor({
    spawnProcess = spawn,
    killGroup = (pid, signal) => process.kill(-pid, signal),
    groupExists = (pid) => processGroupExists(pid),
    platform = process.platform,
    graceMs = 3_000,
  } = {}) {
    if (platform === "win32") {
      throw new Error(
        "Reader summary Chrome E2E process supervision is POSIX-only; Windows process-tree termination is not implemented",
      );
    }
    this.spawnProcess = spawnProcess;
    this.killGroup = killGroup;
    this.groupExists = groupExists;
    this.platform = platform;
    this.graceMs = graceMs;
  }

  spawn(command, args, options = {}) {
    if (this.#closing) {
      throw new Error(
        "Reader summary Chrome E2E process supervisor is already cleaning up",
      );
    }
    const child = this.spawnProcess(command, args, {
      ...options,
      detached: true,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    this.#children.add(child);
    if (Number.isInteger(child.pid)) this.#groups.add(child.pid);
    child.once("close", () => this.#children.delete(child));
    return child;
  }

  #signalGroup(pid, signal) {
    try {
      this.killGroup(pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }

  async terminate(child) {
    if (!Number.isInteger(child?.pid)) return;
    const pid = child.pid;
    this.#signalGroup(pid, "SIGTERM");
    let remaining = await waitForProcessGroups({
      groups: [pid],
      groupExists: this.groupExists,
      timeoutMs: this.graceMs,
    });
    if (remaining.length > 0) this.#signalGroup(pid, "SIGKILL");
    remaining = await waitForProcessGroups({
      groups: remaining,
      groupExists: this.groupExists,
      timeoutMs: this.graceMs,
    });
    this.#groups.delete(pid);
    if (remaining.length > 0) {
      throw new Error(
        `Reader summary Chrome E2E could not terminate process group: ${pid}`,
      );
    }
  }

  async cleanup() {
    this.#closing = true;
    this.#cleanupPromise ??= (async () => {
      const active = [...this.#children];
      const groups = [...this.#groups];
      for (const pid of groups) this.#signalGroup(pid, "SIGTERM");
      const remaining = await waitForProcessGroups({
        groups,
        groupExists: this.groupExists,
        timeoutMs: this.graceMs,
      });
      for (const pid of remaining) this.#signalGroup(pid, "SIGKILL");
      const stubborn = await waitForProcessGroups({
        groups: remaining,
        groupExists: this.groupExists,
        timeoutMs: this.graceMs,
      });
      await Promise.race([
        Promise.all(active.map(waitForClose)),
        new Promise((resolveDelay) => setTimeout(resolveDelay, this.graceMs)),
      ]);
      this.#groups.clear();
      if (stubborn.length > 0) {
        throw new Error(
          `Reader summary Chrome E2E could not terminate process groups: ${stubborn.join(", ")}`,
        );
      }
    })();
    return this.#cleanupPromise;
  }
}

const processGroupExists = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
};

const waitForProcessGroups = async ({ groups, groupExists, timeoutMs }) => {
  const deadline = Date.now() + timeoutMs;
  let remaining = groups.filter((pid) => groupExists(pid));
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, Math.min(25, Math.max(1, timeoutMs))),
    );
    remaining = remaining.filter((pid) => groupExists(pid));
  }
  return remaining;
};

const waitForClose = (child) => {
  if (exited(child)) return Promise.resolve();
  return new Promise((resolveClose) => child.once("close", resolveClose));
};

export const waitForReaderSummaryChild = (child) => {
  if (exited(child)) {
    return Promise.resolve({
      code: child.exitCode,
      signal: child.signalCode,
    });
  }
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolveExit({ code, signal }));
  });
};

export const waitForReaderSummaryChildWithTimeout = async (
  child,
  timeoutMs,
  { setTimer = setTimeout, clearTimer = clearTimeout } = {},
) => {
  let timer;
  const timeout = new Promise((resolveTimeout) => {
    timer = setTimer(() => resolveTimeout({ timedOut: true }), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([
      waitForReaderSummaryChild(child).then((result) => ({ result })),
      timeout,
    ]);
  } finally {
    clearTimer(timer);
  }
};

export const createReaderSummaryIntegrationResultObserver = () => {
  let pending = "";
  let settled = false;
  let resolveResult;
  const result = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const observeStdout = (chunk) => {
    if (settled) return;
    pending += String(chunk ?? "");
    const records = pending.split(/\r?\n/u);
    pending = records.pop() ?? "";
    for (const record of records) {
      if (/^All tests passed\.$/u.test(record.trim())) {
        settled = true;
        resolveResult({ passed: true });
        return;
      }
      if (/^Failure Details:/u.test(record.trim())) {
        settled = true;
        resolveResult({ passed: false });
        return;
      }
    }
  };
  return { observeStdout, result };
};

const boundedUtf8Tail = (value, maxBytes) => {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length <= maxBytes) return value;
  let start = encoded.length - maxBytes;
  while (start < encoded.length && (encoded[start] & 0xc0) === 0x80) start += 1;
  return encoded.subarray(start).toString("utf8");
};

export const parseReaderSummaryFixtureStageLine = (line) => {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (
    record?.status !== "stage" ||
    !fixtureStartupStageIndex.has(record.stage) ||
    !Number.isInteger(record.elapsedMs) ||
    record.elapsedMs < 0
  ) {
    return undefined;
  }
  return { stage: record.stage, elapsedMs: record.elapsedMs };
};

export const createReaderSummaryFixtureStageObserver = ({
  now = monotonicNow,
  parseStageLine = parseReaderSummaryFixtureStageLine,
} = {}) => {
  let latest;
  const observe = (line, observedAt = now()) => {
    const event = parseStageLine(line);
    if (event === undefined) return undefined;
    const index = fixtureStartupStageIndex.get(event.stage);
    if (
      latest !== undefined &&
      (index <= latest.index || event.elapsedMs < latest.elapsedMs)
    ) {
      return undefined;
    }
    latest = { ...event, index, observedAt };
    return event;
  };
  const snapshot = () =>
    latest === undefined
      ? undefined
      : {
          stage: latest.stage,
          elapsedMs: latest.elapsedMs,
          ageMs: Math.max(0, Math.round(now() - latest.observedAt)),
        };
  return { observe, snapshot };
};

const sanitizeDiagnostic = (value, explicitPaths) =>
  redactReaderSummaryDiagnostic(
    value.replace(ansiEscape, "").replace(diagnosticControl, ""),
    explicitPaths,
  ).replace(diagnosticPath, "[REDACTED PATH]");

export const readReaderSummaryDiagnosticLogTail = async ({
  logPath,
  maxBytes = defaultLogTailBytes,
}) => {
  let handle;
  try {
    handle = await open(logPath, "r");
    const { size } = await handle.stat();
    if (size === 0) return "[Diagnostic log is empty]";
    const length = Math.min(size, maxBytes);
    const offset = size - length;
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    let tail = buffer.subarray(0, bytesRead).toString("utf8");
    if (offset > 0) {
      const boundary = tail.search(/[\r\n]/u);
      if (boundary === -1) {
        return "[Diagnostic log has no complete record within the bounded tail]";
      }
      tail = tail.slice(boundary + 1);
    }
    return boundedUtf8Tail(sanitizeDiagnostic(tail, [logPath]), maxBytes);
  } catch (error) {
    if (error?.code === "ENOENT") return "[Diagnostic log is unavailable]";
    return `[Diagnostic log could not be read: ${redactReaderSummaryDiagnostic(error?.code ?? "unknown error")}]`;
  } finally {
    try {
      await handle?.close();
    } catch {
      // Diagnostic cleanup failure adds no useful evidence.
    }
  }
};

export const emitReaderSummaryDriveDiagnostics = async ({
  browserLogPath,
  chromeDriverLogPath,
  forward = (diagnostic) => process.stderr.write(diagnostic),
}) => {
  for (const [label, logPath] of [
    ["ChromeDriver", chromeDriverLogPath],
    ["Chrome browser", browserLogPath],
  ]) {
    const tail = await readReaderSummaryDiagnosticLogTail({ logPath });
    forward(`[reader-summary-e2e] ${label} log tail (redacted):\n${tail}\n`);
  }
};

export const waitForReaderSummaryFixture = ({
  child,
  parseReadyLine,
  inactivityTimeoutMs,
  hardStartupTimeoutMs,
  forwardStdout = (chunk) => process.stdout.write(chunk),
  forwardStderr = (chunk) => process.stderr.write(chunk),
  now = monotonicNow,
  parseStageLine = parseReaderSummaryFixtureStageLine,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) =>
  new Promise((resolveReady, reject) => {
    let settled = false;
    let inactivityTimer;
    let hardStartupTimer;
    const startedAt = now();
    let inactivityDeadline = startedAt + inactivityTimeoutMs;
    const hardDeadline = startedAt + hardStartupTimeoutMs;
    let pending = "";
    let stdout = "";
    let stderr = "";
    const stages = createReaderSummaryFixtureStageObserver({ now, parseStageLine });
    const appendTail = (current, value) =>
      boundedUtf8Tail(`${current}${value}`, defaultLogTailBytes);
    const startupDiagnostics = () => {
      const latest = stages.snapshot();
      const progress = latest === undefined
        ? "Last observed fixture stage: none"
        : `Last observed fixture stage: ${latest.stage} (fixture elapsed=${latest.elapsedMs}ms, stage age=${latest.ageMs}ms)`;
      return [
        progress,
        `stdout tail (redacted):\n${stdout.trim() || "[empty]"}`,
        `stderr tail (redacted):\n${stderr.trim() || "[empty]"}`,
      ].join("\n");
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimer(inactivityTimer);
      clearTimer(hardStartupTimer);
      callback(value);
    };
    const timeoutError = (reason) =>
      new Error(`${reason}\n${startupDiagnostics()}`);
    const inactivityTimeoutError = () =>
      timeoutError(
        `Reader summary fixture made no valid startup progress for ${inactivityTimeoutMs}ms.`,
      );
    const hardStartupTimeoutError = () =>
      timeoutError(
        `Reader summary fixture did not become ready before the hard startup cap of ${hardStartupTimeoutMs}ms.`,
      );
    const expiredDeadlineError = (observedAt) => {
      if (observedAt >= hardDeadline) return hardStartupTimeoutError();
      if (observedAt >= inactivityDeadline) return inactivityTimeoutError();
      return undefined;
    };
    const rejectIfDeadlineExpired = (observedAt) => {
      const error = expiredDeadlineError(observedAt);
      if (error === undefined) return false;
      finish(reject, error);
      return true;
    };
    const scheduleInactivityTimeout = () => {
      if (settled) return;
      clearTimer(inactivityTimer);
      inactivityTimer = setTimer(
        () => {
          if (!rejectIfDeadlineExpired(now())) scheduleInactivityTimeout();
        },
        Math.max(0, inactivityDeadline - now()),
      );
      inactivityTimer.unref?.();
    };
    const scheduleHardStartupTimeout = () => {
      if (settled) return;
      clearTimer(hardStartupTimer);
      hardStartupTimer = setTimer(() => {
        if (now() >= hardDeadline) {
          finish(reject, hardStartupTimeoutError());
        } else {
          scheduleHardStartupTimeout();
        }
      }, Math.max(1, hardDeadline - now()));
      hardStartupTimer.unref?.();
    };
    scheduleHardStartupTimeout();
    scheduleInactivityTimeout();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const stderrRedactor = new ReaderSummaryDiagnosticRedactor({
      forward: (safe) => {
        stderr = appendTail(stderr, safe);
        forwardStderr(safe);
      },
    });
    const stdoutRedactor = new ReaderSummaryDiagnosticRedactor({
      forward: (safe) => {
        pending += safe;
        const lines = pending.split(/\r?\n/u);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const observedAt = now();
          if (rejectIfDeadlineExpired(observedAt)) return;
          const stage = stages.observe(line, observedAt);
          if (stage !== undefined) {
            const canonical = `${JSON.stringify({ status: "stage", ...stage })}\n`;
            stdout = appendTail(stdout, canonical);
            forwardStdout(canonical);
            inactivityDeadline = Math.max(
              inactivityDeadline,
              observedAt + inactivityTimeoutMs,
            );
            scheduleInactivityTimeout();
            continue;
          }
          try {
            const ready = parseReadyLine(line);
            if (ready !== undefined) {
              const canonical = `${JSON.stringify({ status: "ready", baseUrl: ready })}\n`;
              stdout = appendTail(stdout, canonical);
              forwardStdout(canonical);
              finish(resolveReady, ready);
            } else {
              const ignored = "[ignored non-protocol fixture stdout record]\n";
              stdout = appendTail(stdout, ignored);
              forwardStdout(ignored);
            }
          } catch {
            finish(
              reject,
              new Error(
                `Reader summary fixture emitted an invalid readiness record.\n${startupDiagnostics()}`,
              ),
            );
          }
        }
      },
    });
    child.stderr.on("data", (chunk) => stderrRedactor.write(chunk));
    child.stdout.on("data", (chunk) => stdoutRedactor.write(chunk));
    child.once("error", (error) =>
      finish(
        reject,
        new Error(
          `Reader summary fixture process failed before readiness (code=${redactReaderSummaryDiagnostic(error?.code ?? "unknown")}).\n${startupDiagnostics()}`,
        ),
      ));
    child.once("close", (code, signal) => {
      stdoutRedactor.flush();
      stderrRedactor.flush();
      finish(
        reject,
        new Error(
          `Reader summary fixture exited before readiness (code=${code}, signal=${signal}).\n${startupDiagnostics()}`,
        ),
      );
    });
  });
