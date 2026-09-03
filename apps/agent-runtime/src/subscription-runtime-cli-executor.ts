import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  NestStructuredLogger,
  type StructuredLogger,
} from "@social-monitor/platform-logging";
import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutorHealth,
  AgentRuntimeExecutorPort,
} from "./agent-runtime-executor.port";
import {
  attachExecutorOwnedExecutionAttestation,
  invalidAttestationResult,
} from "./subscription-runtime-execution-attestation";
import {
  cliExecutionResult,
  isUsageProbeOutput,
  runCli,
  shouldRetryWithEphemeral,
} from "./subscription-runtime-cli-support";
import {
  FileSubscriptionRuntimeInstallationInspector,
  type SubscriptionRuntimeInstallationInspector,
  type SubscriptionRuntimeInstallationIdentity,
} from "./subscription-runtime-installation";
import {
  admitSubscriptionRuntimeRequest,
  type activeReaderSummaryReasoningEffort,
  configuredSubscriptionRuntimeDefaultsAreSafe,
  type AdmittedSubscriptionRuntimeRequest,
  type SubscriptionRuntimePurposeProfile,
} from "./subscription-runtime-purpose-model-policy";

export type SubscriptionRuntimeCliExecutorOptions = {
  readonly command: string;
  readonly stateRoot?: string;
  readonly ephemeral: boolean;
  readonly localEncryptionKey?: string;
  readonly codexAuthJsonPath?: string;
  readonly claudeTokenEnv?: string;
  readonly model?: string;
  readonly reasoningEffort?: typeof activeReaderSummaryReasoningEffort;
  readonly installationInspector?: SubscriptionRuntimeInstallationInspector;
  readonly logger?: StructuredLogger;
};

export class SubscriptionRuntimeCliExecutor implements AgentRuntimeExecutorPort {
  private readonly installationInspector: SubscriptionRuntimeInstallationInspector;
  private readonly logger: StructuredLogger;

  constructor(private readonly options: SubscriptionRuntimeCliExecutorOptions) {
    this.installationInspector =
      options.installationInspector ??
      new FileSubscriptionRuntimeInstallationInspector();
    this.logger =
      options.logger ??
      new NestStructuredLogger(SubscriptionRuntimeCliExecutor.name);
  }

  async execute(
    request: AgentRuntimeExecutionRequest,
  ): Promise<AgentRuntimeExecutionResult> {
    const startedAt = Date.now();
    this.logger.info("agent runtime task started", taskFields(request));
    let admission: AdmittedSubscriptionRuntimeRequest;
    try {
      if (!configuredSubscriptionRuntimeDefaultsAreSafe(this.options)) {
        this.logger.error("agent runtime task rejected unsafe defaults", {
          ...taskFields(request),
          stage: "defaults",
        });
        return invalidAttestationResult();
      }
      admission = admitSubscriptionRuntimeRequest(request);
    } catch (error) {
      this.logFailure(request, "admission", error);
      return invalidAttestationResult();
    }
    let admittedInstallation: SubscriptionRuntimeInstallationIdentity;
    try {
      admittedInstallation = await this.installationInspector.inspect(
        this.options.command,
      );
    } catch (error) {
      this.logFailure(request, "installation", error);
      return invalidAttestationResult();
    }
    let tempDir: string;
    try {
      tempDir = await mkdtemp(join(tmpdir(), "social-monitor-agent-runtime-"));
    } catch (error) {
      this.logFailure(request, "workspace", error);
      return invalidAttestationResult();
    }
    const inputPath = join(tempDir, "request.json");
    try {
      await writeFile(
        inputPath,
        JSON.stringify(admission.canonicalRequest),
        "utf8",
      );
      const initialResult = cliExecutionResult(
        await runCli({
          command: admittedInstallation.executablePath,
          args: this.buildArgs(request, inputPath, admission.profile),
          env: this.executionEnvPatch(
            this.options.ephemeral,
            admission.profile,
          ),
          timeoutMs: request.timeoutMs,
        }),
      );
      if (!shouldRetryWithEphemeral(initialResult, this.options)) {
        const result = await this.attestCompletedResult(
          request,
          admission,
          initialResult,
          admittedInstallation,
        );
        this.logResult(request, result, startedAt);
        return result;
      }
      this.logger.warn(
        "agent runtime durable session unavailable; retrying ephemeral",
        {
          ...taskFields(request),
          stage: "retry",
          failureCode: initialResult.failure?.code,
          durationMs: Date.now() - startedAt,
        },
      );
      const remainingTimeoutMs = request.timeoutMs - (Date.now() - startedAt);
      if (remainingTimeoutMs <= 0) {
        this.logResult(request, initialResult, startedAt);
        return initialResult;
      }
      const recovered = cliExecutionResult(
        await runCli({
          command: admittedInstallation.executablePath,
          args: this.buildArgs(request, inputPath, admission.profile, true),
          env: this.executionEnvPatch(true, admission.profile),
          timeoutMs: remainingTimeoutMs,
        }),
      );
      const result = await this.attestCompletedResult(
        request,
        admission,
        {
          ...recovered,
          warnings: [
            ...recovered.warnings,
            {
              code: "agent_runtime.session_recovered_ephemeral",
              message:
                "Durable provider session was unavailable; retried in an isolated session",
            },
          ],
        },
        admittedInstallation,
      );
      this.logResult(request, result, startedAt);
      return result;
    } catch (error) {
      this.logger.error("agent runtime task execution threw", {
        ...taskFields(request),
        stage: "execution",
        durationMs: Date.now() - startedAt,
        error: safeErrorMessage(error),
      });
      throw error;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async checkHealth(): Promise<AgentRuntimeExecutorHealth> {
    if (this.options.command.trim().length === 0) {
      this.logger.error("agent runtime health check rejected empty command", {
        stage: "health",
      });
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
      const installation = await this.installationInspector.inspect(
        this.options.command,
      );
      const probe = await runCli({
        command: installation.executablePath,
        args: ["--provider", "codex"],
        timeoutMs: 2_000,
      });
      const healthy =
        !probe.timedOut &&
        (probe.exitCode === 0 ||
          isUsageProbeOutput(probe.stdout, probe.stderr));
      if (!healthy) {
        this.logger.warn("agent runtime health probe failed", {
          stage: "health",
          timedOut: probe.timedOut,
          exitCode: probe.exitCode ?? "null",
        });
      }
      return {
        healthy,
        runtimeEngine: "subscription-runtime-cli",
        runtimeVersion: installation.runtimePackageVersion,
        launcherSha256: installation.launcherSha256,
        warnings: healthy
          ? []
          : [
              {
                code: "agent_runtime.cli_probe_failed",
                message: "Agent runtime CLI health probe failed",
              },
            ],
      };
    } catch (error) {
      this.logger.error("agent runtime health check threw", {
        stage: "health",
        error: safeErrorMessage(error),
      });
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

  private attestCompletedResult(
    request: AgentRuntimeExecutionRequest,
    admission: AdmittedSubscriptionRuntimeRequest,
    result: AgentRuntimeExecutionResult,
    admittedInstallation: SubscriptionRuntimeInstallationIdentity,
  ): Promise<AgentRuntimeExecutionResult> {
    return attachExecutorOwnedExecutionAttestation({
      command: admittedInstallation.executablePath,
      request,
      canonicalRequest: admission.canonicalRequest,
      result,
      profile: admission.profile,
      installationInspector: this.installationInspector,
      admittedInstallation,
    });
  }

  private logResult(
    request: AgentRuntimeExecutionRequest,
    result: AgentRuntimeExecutionResult,
    startedAt: number,
  ): void {
    const fields = {
      ...taskFields(request),
      status: result.status,
      durationMs: Date.now() - startedAt,
      warningCount: result.warnings.length,
      failureCode: result.failure?.code,
      retryable: result.failure?.retryable,
      reconnectRequired: result.failure?.reconnectRequired,
    };
    if (result.status === "completed") {
      this.logger.info("agent runtime task completed", fields);
    } else {
      this.logger.error("agent runtime task did not complete", fields);
    }
  }

  private logFailure(
    request: AgentRuntimeExecutionRequest,
    stage: string,
    error: unknown,
  ): void {
    this.logger.error("agent runtime task rejected", {
      ...taskFields(request),
      stage,
      error: safeErrorMessage(error),
    });
  }

  private buildArgs(
    request: AgentRuntimeExecutionRequest,
    inputPath: string,
    profile: SubscriptionRuntimePurposeProfile,
    ephemeral = this.options.ephemeral,
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
    if (ephemeral) {
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
    args.push("--model", profile.model);
    return args;
  }

  private executionEnvPatch(
    ephemeral: boolean,
    profile: SubscriptionRuntimePurposeProfile,
  ): Readonly<Record<string, string>> {
    const patch: Record<string, string> = {};
    if (!ephemeral && this.options.localEncryptionKey !== undefined) {
      patch.SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY =
        this.options.localEncryptionKey;
    }
    patch.AGENT_RUNTIME_REASONING_EFFORT = profile.reasoningEffort;
    return patch;
  }
}

const taskFields = (
  request: AgentRuntimeExecutionRequest,
): Readonly<Record<string, string | number | boolean | undefined>> => ({
  requestId: request.requestId,
  correlationId: request.correlationId,
  provider: request.provider,
  purpose: request.purpose,
  timeoutMs: request.timeoutMs,
});

const safeErrorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error))
    .replaceAll(/\s+/g, " ")
    .slice(0, 256);
