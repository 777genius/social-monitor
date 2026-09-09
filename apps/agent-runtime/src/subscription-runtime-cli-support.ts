import { spawn } from "node:child_process";
import { createAssessmentProgressParser, type AssessmentProgress } from "./subscription-runtime-cli-progress";

import type {
  AgentRuntimeExecutionFailure,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutionUsage,
  AgentRuntimeExecutionWarning,
} from "./agent-runtime-executor.port";
import { parseSubscriptionRuntimeJsonObject } from "./subscription-runtime-execution-attestation";

export const shouldRetryWithEphemeral = (
  result: AgentRuntimeExecutionResult,
  options: { readonly ephemeral: boolean },
): boolean =>
  !options.ephemeral &&
  result.status === "failed" &&
  (result.failure?.code === "provider_session_invalid" ||
    result.failure?.code === "needs_reconnect") &&
  result.failure.reconnectRequired;

export const parseSubscriptionRuntimeCliResult = (
  stdout: string,
): AgentRuntimeExecutionResult => {
  const parsed = parseSubscriptionRuntimeJsonObject(
    stdout,
    "subscription-runtime result",
  );
  const status = parseStatus(parsed.status);
  const telemetry = readOptionalRecord(parsed.telemetry);

  return {
    status,
    outputText: optionalOutputText(parsed.outputText),
    structuredOutput: readOptionalRecord(parsed.structuredOutput),
    warnings: readWarnings(parsed.warnings),
    usage: readUsage(telemetry?.usage),
    durationMs: nonNegativeSafeInteger(telemetry?.durationMs),
    failure: readFailure(parsed.failure),
  };
};

const tryParseCliResult = (
  stdout: string,
): AgentRuntimeExecutionResult | undefined => {
  try {
    return parseSubscriptionRuntimeCliResult(stdout);
  } catch {
    return undefined;
  }
};

type CliExecution = Awaited<ReturnType<typeof runCli>>;

export const cliExecutionResult = (
  result: CliExecution,
): AgentRuntimeExecutionResult => {
  const parsedResult = tryParseCliResult(result.stdout);
  if (parsedResult !== undefined && !result.timedOut &&
      (parsedResult.status !== "completed" || (result.exitCode === 0 && result.signal === null))) {
    return parsedResult;
  }
  if (result.timedOut || result.exitCode !== 0) {
    return {
      status: "failed",
      warnings: [],
      failure: {
        code: result.timedOut
          ? "agent_runtime.cli_timeout"
          : "agent_runtime.cli_exit",
        safeMessage: result.timedOut
          ? "Agent runtime task timed out"
          : "Agent runtime CLI task failed",
        retryable: true,
        reconnectRequired: false,
        causeCategory: "subscription_runtime_cli",
        details: {
          exitCode: result.exitCode === null ? "null" : String(result.exitCode),
          signal: result.signal ?? "",
          stderrBytes: String(result.stderrBytes ?? Buffer.byteLength(result.stderr)),
        },
      },
    };
  }

  return invalidCliResult(result.stdout);
};

const invalidCliResult = (stdout: string): AgentRuntimeExecutionResult => ({
  status: "failed",
  warnings: [],
  failure: {
    code: "agent_runtime.invalid_cli_result",
    safeMessage: "Agent runtime CLI returned invalid result JSON",
    retryable: false,
    reconnectRequired: false,
    causeCategory: "schema",
    details: {
      stdoutBytes: String(Buffer.byteLength(stdout)),
    },
  },
});

export const runCli = async (params: {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly assessment?: { readonly onProgress: (record: AssessmentProgress) => void };
}): Promise<{
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stderrBytes?: number;
  readonly timedOut: boolean;
}> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + params.timeoutMs;
    const startedAt = performance.now();
    const remaining = () => Math.max(0, params.timeoutMs - (performance.now() - startedAt));
    if (params.assessment && params.timeoutMs <= 20_000) {
      resolve({ exitCode: null, signal: null, stdout: "", stderr: "", timedOut: true });
      return;
    }
    const env = { ...subscriptionRuntimeChildBaseEnv(process.env), ...params.env };
    delete env.SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS;
    if (params.assessment) env.SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS = String(deadline);
    const progress = params.assessment && createAssessmentProgressParser(params.assessment.onProgress);
    let stderrBytes = 0;
    const child = spawn(params.command, params.args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let settled = false;
    let earlyTimeout: ReturnType<typeof setTimeout> | undefined;
    let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
    const stopLocalChild = () => {
      // Best-effort local cleanup only; signals never acknowledge remote termination.
      try { child.kill("SIGKILL"); } catch { /* Child may already be gone. */ }
      for (const cleanup of [() => child.stdout?.destroy(), () => child.stderr?.destroy(), () => child.unref()]) {
        try { cleanup(); } catch { /* Cleanup cannot replace the execution outcome. */ }
      }
    };
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      // Close can run before an overdue timer after event-loop starvation.
      if (params.assessment && remaining() <= 20_000) timedOut = true;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(cleanupTimeout);
      clearTimeout(earlyTimeout);
      resolve({ exitCode, signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"), stderrBytes, timedOut });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      // Bound the local wait even if SIGTERM is ignored or close never arrives.
      cleanupTimeout = setTimeout(() => {
        stopLocalChild();
        finish(null, null);
      }, 1_000);
      try { child.kill("SIGTERM"); } catch { /* Cleanup deadline still applies. */ }
    }, params.assessment ? remaining() : params.timeoutMs);
    if (params.assessment) earlyTimeout = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch { /* Hard deadline remains authoritative. */ }
    }, Math.max(0, remaining() - 20_000));
    child.stdout!.on("data", (chunk: Buffer) => { if (!settled) stdout.push(chunk); });
    child.stderr!.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderrBytes = Math.min(Number.MAX_SAFE_INTEGER, stderrBytes + chunk.length);
      if (progress) progress(chunk); else stderr.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(cleanupTimeout);
      clearTimeout(earlyTimeout);
      stopLocalChild();
      reject(error);
    });
    child.on("close", finish);
  });

const subscriptionRuntimeChildBaseEnv = (
  env: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) =>
        value !== undefined &&
        !runtimeSessionScopedEnvKeys.has(key) &&
        !isApiKeyCredentialEnvKey(key),
    ),
  ) as Readonly<Record<string, string>>;

const runtimeSessionScopedEnvKeys = new Set([
  "CODEX_THREAD_ID",
  "CODEX_GOAL_ID",
  "CODEX_TURN_ID",
  "CODEX_SESSION_ID",
]);

const isApiKeyCredentialEnvKey = (key: string): boolean =>
  key.endsWith("_API_KEY") || key.endsWith("_API_KEY_FILE");

export const isUsageProbeOutput = (stdout: string, stderr: string): boolean => {
  const output = `${stdout}\n${stderr}`;
  return (
    output.includes("subscription-runtime-run-agent-task") ||
    output.includes("--input is required")
  );
};

const parseStatus = (value: unknown): AgentRuntimeExecutionResult["status"] => {
  if (
    value === "completed" ||
    value === "failed" ||
    value === "waiting_for_input"
  ) {
    return value;
  }

  return "failed";
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const optionalOutputText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const readOptionalRecord = (
  value: unknown,
): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const readWarnings = (
  value: unknown,
): readonly AgentRuntimeExecutionWarning[] =>
  Array.isArray(value)
    ? value.flatMap((item): readonly AgentRuntimeExecutionWarning[] => {
        const record = readOptionalRecord(item);
        const code = optionalString(record?.code);
        const message = optionalString(record?.message);

        return code === undefined || message === undefined
          ? []
          : [{ code, message }];
      })
    : [];

const readUsage = (value: unknown): AgentRuntimeExecutionUsage | undefined => {
  const record = readOptionalRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const inputTokens = nonNegativeSafeInteger(record.inputTokens);
  const outputTokens = nonNegativeSafeInteger(record.outputTokens);
  const totalTokens = nonNegativeSafeInteger(record.totalTokens);
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
    estimatedCostUsd: nonNegativeNumber(record.estimatedCostUsd),
  };
};

const readFailure = (
  value: unknown,
): AgentRuntimeExecutionFailure | undefined => {
  const record = readOptionalRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const details = readSafeRuntimeFailureDetails(record.details);
  const code = promotedRuntimeFailureCode(record.code, details.reason);

  return {
    code,
    safeMessage:
      optionalString(record.safeMessage) ??
      optionalString(record.message) ??
      "Agent runtime task failed",
    retryable: record.retryable === true || retryableRuntimeCodes.has(code),
    reconnectRequired:
      record.reconnectRequired === true || code === "needs_reconnect",
    causeCategory: optionalString(record.causeCategory) ?? "agent_runtime",
    details,
  };
};

const safeRuntimeFailureDetailKeys = new Set([
  "capacityReason",
  "safeExecutorStatus",
  "availability",
  "cooldownUntil",
  "reason",
  "subscriptionWorkerCode",
]);

// CLI JSON is untrusted even when the wrapper normally filters these values.
const safeRuntimeCapacityReasons = new Set([
  "quota_recheck_identity_changed", "quota_recheck_inconclusive",
  "quota_recheck_failed", "rate_limit_threshold", "quota_limited", "account_exhausted",
]);
const safeRuntimeExecutorStatuses = new Set([
  "waiting_capacity", "partial", "failed", "aborted",
]);

const readSafeRuntimeFailureDetails = (
  value: unknown,
): Readonly<Record<string, string>> => {
  const record = readOptionalRecord(value);
  if (record === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, detail]) => {
      const safeValue = optionalString(detail);
      if (!safeRuntimeFailureDetailKeys.has(key) || safeValue === undefined) {
        return [];
      }
      if (key === "capacityReason" && !safeRuntimeCapacityReasons.has(safeValue)) {
        return [];
      }
      if (key === "safeExecutorStatus" && !safeRuntimeExecutorStatuses.has(safeValue)) {
        return [];
      }
      return [[key, safeValue]];
    }),
  );
};

const promotedRuntimeFailureCode = (
  value: unknown,
  reason: string | undefined,
): string => {
  const code = optionalString(value) ?? "agent_runtime.failed";
  if (code !== "unknown_runtime_failure") {
    return code;
  }

  return runtimeFailureCodeBySafeReason[reason ?? ""] ?? code;
};

const runtimeFailureCodeBySafeReason: Readonly<Record<string, string>> = {
  account_unavailable: "provider_session_invalid",
  capacity_unavailable: "backend_unavailable",
  provider_output_invalid: "provider_output_invalid",
  quota_limited: "quota_limited",
  reconnect_required: "needs_reconnect",
  task_timeout: "task_timeout",
  user_abort: "task_cancelled",
};

const retryableRuntimeCodes = new Set([
  "backend_unavailable",
  "needs_reconnect",
  "provider_session_invalid",
  "quota_limited",
  "task_timeout",
]);

const nonNegativeSafeInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const nonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
