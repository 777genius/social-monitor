import {
  credentials,
  type ChannelCredentials,
  type ClientUnaryCall,
} from "@grpc/grpc-js";
import {
  AgentRuntimeHealthStatus as GrpcAgentRuntimeHealthStatus,
  AgentRuntimeProvider as GrpcAgentRuntimeProvider,
  AgentRuntimeSelectedOutputKind as GrpcAgentRuntimeSelectedOutputKind,
  AgentRuntimeServiceClient,
  AgentRuntimeTaskStatus as GrpcAgentRuntimeTaskStatus,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  executionAttestationOutputMatches,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
} from "@social-monitor/platform-grpc";
import type { Clock } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeExecutionAttestation,
  AgentRuntimeHealthResult,
  AgentRuntimeHealthStatus,
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  AgentRuntimeTaskStatus,
} from "../../ports";

export type GrpcAgentRuntimeClientOptions = {
  readonly timeoutMs: number;
  readonly serviceToken?: string;
};

const schemaVersion = 1;
const taskTransportGraceMs = 5_000;

export const agentRuntimeTaskDeadlineTimeoutMs = (
  taskTimeoutMs: number,
): number => taskTimeoutMs + taskTransportGraceMs;

export class GrpcAgentRuntimeClient implements AgentRuntimeClientPort {
  static connect(params: {
    readonly address: string;
    readonly clock: Clock;
    readonly options: GrpcAgentRuntimeClientOptions;
    readonly credentials?: ChannelCredentials;
  }): GrpcAgentRuntimeClient {
    return new GrpcAgentRuntimeClient(
      new AgentRuntimeServiceClient(
        params.address,
        params.credentials ?? credentials.createInsecure(),
      ),
      params.clock,
      params.options,
    );
  }

  constructor(
    private readonly client: AgentRuntimeServiceClient,
    private readonly clock: Clock,
    private readonly options: GrpcAgentRuntimeClientOptions,
  ) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new Error("Agent runtime gRPC timeout must be a positive integer");
    }
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult> {
    if (options?.signal?.aborted === true) {
      throw new Error("Agent runtime gRPC task was cancelled");
    }
    const metadata = createGrpcRequestMetadata({
      correlationId: command.correlationId,
      serviceToken: this.options.serviceToken,
    });
    const deadline = createGrpcDeadline(
      this.clock,
      agentRuntimeTaskDeadlineTimeoutMs(command.timeoutMs),
    );

    return new Promise((resolve, reject) => {
      const callState: { value?: ClientUnaryCall } = {};
      let settled = false;
      const finish = (complete: () => void): void => {
        if (settled) return;
        settled = true;
        if (options?.signal !== undefined) {
          options.signal.removeEventListener("abort", abort);
        }
        complete();
      };
      const abort = (): void => {
        callState.value?.cancel();
        finish(() => reject(new Error("Agent runtime gRPC task was cancelled")));
      };
      options?.signal?.addEventListener("abort", abort, { once: true });
      callState.value = this.client.runAgentTask(
        {
          schemaVersion,
          requestId: command.requestId,
          tenantId: String(command.tenantId),
          workspaceId: String(command.workspaceId),
          correlationId: command.correlationId,
          provider: toGrpcProvider(command.provider),
          providerInstanceId: command.providerInstanceId ?? "",
          purpose: command.purpose,
          systemPrompt: command.systemPrompt,
          prompt: command.prompt,
          outputSchemaJson: JSON.stringify(command.outputSchema),
          controlsJson: JSON.stringify(command.controls),
          timeoutMs: command.timeoutMs,
          cwd: command.cwd ?? "",
          metadata: command.metadata ?? {},
        },
        metadata,
        { deadline },
        (error, response) => {
          if (error !== null) {
            finish(() => reject(error));
            return;
          }

          try {
            const result = fromGrpcTaskResponse(response, command);
            finish(() => resolve(result));
          } catch (parseError) {
            finish(() => reject(parseError));
          }
        },
      );
      if (options?.signal?.aborted === true) abort();
    });
  }

  async checkHealth(service: string): Promise<AgentRuntimeHealthResult> {
    const metadata = createGrpcRequestMetadata({
      correlationId: `agent-runtime-health:${service}`,
      serviceToken: this.options.serviceToken,
    });
    const deadline = createGrpcDeadline(this.clock, this.options.timeoutMs);

    return new Promise((resolve, reject) => {
      this.client.checkHealth(
        { service },
        metadata,
        { deadline },
        (error, response) => {
          if (error !== null) {
            reject(error);
            return;
          }

          try {
            resolve({
              status: fromGrpcHealthStatus(response.status),
              runtimeEngine: response.runtimeEngine,
              runtimeVersion: response.runtimeVersion,
              launcherSha256:
                response.launcherSha256.trim().length > 0
                  ? response.launcherSha256
                  : undefined,
              warnings: response.warnings.map((warning) => ({
                code: warning.code,
                message: warning.message,
              })),
            });
          } catch (parseError) {
            reject(parseError);
          }
        },
      );
    });
  }
}

const toGrpcProvider = (
  provider: AgentRuntimeProvider,
): GrpcAgentRuntimeProvider => {
  switch (provider) {
    case "codex":
      return GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX;
    case "claude":
      return GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CLAUDE;
  }
};

const fromGrpcTaskResponse = (
  response: AgentRuntimeTaskResponse,
  command: AgentRuntimeTaskCommand,
): AgentRuntimeTaskResult => {
  if (response.schemaVersion !== schemaVersion) {
    throw new Error("Unsupported agent runtime response schema version");
  }
  const usage = readGrpcUsage(response.usage);
  const durationMs = readOptionalDurationMs(response.durationMs);
  const result: AgentRuntimeTaskResult = {
    status: fromGrpcTaskStatus(response.status),
    outputText: optionalOutputText(response.outputText),
    structuredOutput: parseOptionalJsonObject(response.structuredOutputJson),
    warnings: response.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
    usage,
    durationMs,
    failure:
      response.failure === undefined
        ? undefined
        : {
            code: response.failure.code,
            safeMessage: response.failure.safeMessage,
            retryable: response.failure.retryable,
            reconnectRequired: response.failure.reconnectRequired,
            causeCategory: response.failure.causeCategory,
            details: response.failure.details,
          },
    executionAttestation: readExecutionAttestation(response, command),
  };
  if (
    result.status === "completed" &&
    (result.executionAttestation === undefined ||
      !executionAttestationOutputMatches(result.executionAttestation, result))
  ) {
    throw new Error(
      "Completed agent runtime response has an invalid output attestation",
    );
  }
  if (
    result.status !== "completed" &&
    result.executionAttestation !== undefined
  ) {
    throw new Error(
      "Non-completed agent runtime response must not be attested",
    );
  }
  return result;
};

const readGrpcUsage = (
  value: AgentRuntimeTaskResponse["usage"],
): AgentRuntimeTaskResult["usage"] => {
  if (value === undefined) return undefined;
  if (
    !nonNegativeSafeInteger(value.inputTokens) ||
    !nonNegativeSafeInteger(value.outputTokens) ||
    !nonNegativeSafeInteger(value.totalTokens) ||
    value.totalTokens !== value.inputTokens + value.outputTokens ||
    !nonNegativeFiniteNumber(value.estimatedCostUsd)
  ) {
    throw new Error("Agent runtime usage is malformed");
  }
  return {
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
    estimatedCostUsd: value.estimatedCostUsd,
  };
};

const readOptionalDurationMs = (value: number | undefined): number | undefined => {
  if (value === undefined) return undefined;
  if (!nonNegativeSafeInteger(value)) {
    throw new Error("Agent runtime duration is malformed");
  }
  return value;
};

const nonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const nonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const readExecutionAttestation = (
  response: AgentRuntimeTaskResponse,
  command: AgentRuntimeTaskCommand,
): AgentRuntimeExecutionAttestation | undefined => {
  const value = response.executionAttestation;
  if (value === undefined) {
    return undefined;
  }
  const provider = fromGrpcProvider(value.provider);
  const selectedOutputKind = fromGrpcSelectedOutputKind(
    value.selectedOutputKind,
  );
  if (
    value.schemaVersion !== 1 ||
    value.requestId !== command.requestId ||
    value.purpose !== command.purpose ||
    provider !== command.provider ||
    value.model.trim().length === 0 ||
    value.reasoningEffort.trim().length === 0 ||
    value.runtimeEngine !== subscriptionRuntimeEngine ||
    !isConcreteRuntimePackageVersion(value.runtimePackageVersion) ||
    !isSha256Hex(value.canonicalRequestSha256) ||
    !isSha256Hex(value.launcherSha256) ||
    !isSha256Hex(value.selectedOutputSha256)
  ) {
    throw new Error("Agent runtime execution attestation is malformed");
  }
  return {
    schemaVersion: 1,
    requestId: value.requestId,
    purpose: value.purpose,
    canonicalRequestSha256: value.canonicalRequestSha256,
    provider,
    model: value.model,
    reasoningEffort: value.reasoningEffort,
    runtimeEngine: subscriptionRuntimeEngine,
    runtimePackageVersion: value.runtimePackageVersion,
    launcherSha256: value.launcherSha256,
    selectedOutputKind,
    selectedOutputSha256: value.selectedOutputSha256,
  };
};

const fromGrpcProvider = (
  provider: GrpcAgentRuntimeProvider,
): AgentRuntimeProvider => {
  switch (provider) {
    case GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX:
      return "codex";
    case GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CLAUDE:
      return "claude";
    case GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_UNSPECIFIED:
    case GrpcAgentRuntimeProvider.UNRECOGNIZED:
      throw new Error("Attested agent runtime provider is unspecified");
  }
};

const fromGrpcSelectedOutputKind = (
  kind: GrpcAgentRuntimeSelectedOutputKind,
): AgentRuntimeExecutionAttestation["selectedOutputKind"] => {
  switch (kind) {
    case GrpcAgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_STRUCTURED_OUTPUT:
      return "structured_output";
    case GrpcAgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_OUTPUT_TEXT:
      return "output_text";
    case GrpcAgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_UNSPECIFIED:
    case GrpcAgentRuntimeSelectedOutputKind.UNRECOGNIZED:
      throw new Error("Attested agent runtime output kind is unspecified");
  }
};

const fromGrpcTaskStatus = (
  status: GrpcAgentRuntimeTaskStatus,
): AgentRuntimeTaskStatus => {
  switch (status) {
    case GrpcAgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_COMPLETED:
      return "completed";
    case GrpcAgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_WAITING_FOR_INPUT:
      return "waiting_for_input";
    case GrpcAgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_FAILED:
    case GrpcAgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_UNSPECIFIED:
    case GrpcAgentRuntimeTaskStatus.UNRECOGNIZED:
      return "failed";
  }
};

const fromGrpcHealthStatus = (
  status: GrpcAgentRuntimeHealthStatus,
): AgentRuntimeHealthStatus => {
  switch (status) {
    case GrpcAgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_SERVING:
      return "serving";
    case GrpcAgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_DEGRADED:
      return "degraded";
    case GrpcAgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_NOT_SERVING:
    case GrpcAgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_UNSPECIFIED:
    case GrpcAgentRuntimeHealthStatus.UNRECOGNIZED:
      return "not_serving";
  }
};

const optionalOutputText = (value: string): string | undefined =>
  value.trim().length === 0 ? undefined : value;

const parseOptionalJsonObject = (
  value: string,
): Record<string, unknown> | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Agent runtime structured output must be a JSON object");
  }

  return parsed as Record<string, unknown>;
};
