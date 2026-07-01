import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AgentRuntimeExecutionFailure,
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutionUsage,
  AgentRuntimeExecutionWarning,
  AgentRuntimeExecutorHealth,
  AgentRuntimeExecutorPort,
} from "./agent-runtime-executor.port";

export type SubscriptionRuntimeCliExecutorOptions = {
  readonly command: string;
  readonly stateRoot?: string;
  readonly ephemeral: boolean;
  readonly codexAuthJsonPath?: string;
  readonly claudeTokenEnv?: string;
  readonly model?: string;
};

export class SubscriptionRuntimeCliExecutor implements AgentRuntimeExecutorPort {
  constructor(private readonly options: SubscriptionRuntimeCliExecutorOptions) {}

  async execute(
    request: AgentRuntimeExecutionRequest,
  ): Promise<AgentRuntimeExecutionResult> {
    const tempDir = await mkdtemp(join(tmpdir(), "social-monitor-agent-runtime-"));
    const inputPath = join(tempDir, "request.json");

    try {
      await writeFile(
        inputPath,
        JSON.stringify(toSubscriptionRuntimeRequest(request)),
        "utf8",
      );

      const result = await runCli({
        command: this.options.command,
        args: this.buildArgs(request, inputPath),
        timeoutMs: request.timeoutMs,
      });

      const parsedResult = tryParseCliResult(result.stdout);

      if (parsedResult !== undefined && !result.timedOut) {
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
              exitCode:
                result.exitCode === null ? "null" : String(result.exitCode),
              signal: result.signal ?? "",
              stderrBytes: String(Buffer.byteLength(result.stderr)),
            },
          },
        };
      }

      return invalidCliResult(result.stdout);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async checkHealth(): Promise<AgentRuntimeExecutorHealth> {
    if (this.options.command.trim().length === 0) {
      return {
        healthy: false,
        runtimeEngine: "subscription-runtime-cli",
        runtimeVersion: "unknown",
        warnings: [
          {
            code: "agent_runtime.cli_missing",
            message: "Agent runtime CLI path is empty",
          },
        ],
      };
    }

    try {
      const probe = await runCli({
        command: this.options.command,
        args: ["--help"],
        timeoutMs: 2_000,
      });
      const healthy =
        !probe.timedOut &&
        (probe.exitCode === 0 || isUsageProbeOutput(probe.stdout, probe.stderr));

      return {
        healthy,
        runtimeEngine: "subscription-runtime-cli",
        runtimeVersion: "unknown",
        warnings: healthy
          ? []
          : [
              {
                code: "agent_runtime.cli_probe_failed",
                message: "Agent runtime CLI health probe failed",
              },
            ],
      };
    } catch {
      return {
        healthy: false,
        runtimeEngine: "subscription-runtime-cli",
        runtimeVersion: "unknown",
        warnings: [
          {
            code: "agent_runtime.cli_unavailable",
            message: "Agent runtime CLI is not available",
          },
        ],
      };
    }
  }

  private buildArgs(
    request: AgentRuntimeExecutionRequest,
    inputPath: string,
  ): readonly string[] {
    const args = [
      "--provider",
      request.provider,
      "--input",
      inputPath,
      "--format",
      "result-json",
      "--timeout-ms",
      String(request.timeoutMs),
    ];

    if (this.options.stateRoot !== undefined) {
      args.push("--state-root", this.options.stateRoot);
    }
    if (this.options.ephemeral) {
      args.push("--ephemeral");
    }
    if (
      request.provider === "codex" &&
      this.options.codexAuthJsonPath !== undefined
    ) {
      args.push("--codex-auth-json", this.options.codexAuthJsonPath);
    }
    if (
      request.provider === "claude" &&
      this.options.claudeTokenEnv !== undefined
    ) {
      args.push("--claude-token-env", this.options.claudeTokenEnv);
    }
    if (this.options.model !== undefined) {
      args.push("--model", this.options.model);
    }

    return args;
  }
}

const toSubscriptionRuntimeRequest = (
  request: AgentRuntimeExecutionRequest,
): Record<string, unknown> => {
  const controls = readJsonObject(request.controlsJson, "controls_json");

  return {
    protocolVersion: 1,
    runId: request.requestId,
    providerInstanceId: request.providerInstanceId,
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
    task: {
      kind: "structured-prompt",
      systemPrompt: request.systemPrompt,
      prompt: request.prompt,
      outputSchemaName:
        typeof controls.outputSchemaName === "string"
          ? controls.outputSchemaName
          : undefined,
      controls: {
        ...controls,
        responseFormat: "json",
        outputSchemaJson: request.outputSchemaJson,
      },
      metadata: request.metadata,
    },
    context: {
      application: "social-monitor",
      purpose: request.purpose,
      correlationId: request.correlationId,
      metadata: {
        tenantId: request.tenantId,
        workspaceId: request.workspaceId,
      },
    },
  };
};

const parseCliResult = (stdout: string): AgentRuntimeExecutionResult => {
  const parsed = readJsonObject(stdout, "subscription-runtime result");
  const status = parseStatus(parsed.status);

  return {
    status,
    outputText: optionalString(parsed.outputText),
    structuredOutput: readOptionalRecord(parsed.structuredOutput),
    warnings: readWarnings(parsed.warnings),
    usage: readUsage(parsed.usage),
    failure: readFailure(parsed.failure),
  };
};

const tryParseCliResult = (
  stdout: string,
): AgentRuntimeExecutionResult | undefined => {
  try {
    return parseCliResult(stdout);
  } catch {
    return undefined;
  }
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

const runCli = async (params: {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}): Promise<{
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}> =>
  new Promise((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, params.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
      });
    });
  });

const isUsageProbeOutput = (stdout: string, stderr: string): boolean =>
  `${stdout}\n${stderr}`.includes("subscription-runtime-run-agent-task");

const readJsonObject = (
  value: string,
  label: string,
): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`);
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `${label} must be JSON`,
    );
  }
};

const parseStatus = (
  value: unknown,
): AgentRuntimeExecutionResult["status"] => {
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

  return {
    inputTokens: nonNegativeInteger(record.inputTokens),
    outputTokens: nonNegativeInteger(record.outputTokens),
    totalTokens: nonNegativeInteger(record.totalTokens),
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

  return {
    code: optionalString(record.code) ?? "agent_runtime.failed",
    safeMessage:
      optionalString(record.safeMessage) ??
      optionalString(record.message) ??
      "Agent runtime task failed",
    retryable: record.retryable === true,
    reconnectRequired: record.reconnectRequired === true,
    causeCategory: optionalString(record.causeCategory) ?? "agent_runtime",
    details: {},
  };
};

const nonNegativeInteger = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;

const nonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
