import { credentials, type ChannelCredentials } from "@grpc/grpc-js";
import {
  AgentRuntimeHealthStatus as GrpcAgentRuntimeHealthStatus,
  AgentRuntimeProvider as GrpcAgentRuntimeProvider,
  AgentRuntimeServiceClient,
  AgentRuntimeTaskStatus as GrpcAgentRuntimeTaskStatus,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
} from "@social-monitor/platform-grpc";
import type { Clock } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
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
  ): Promise<AgentRuntimeTaskResult> {
    const metadata = createGrpcRequestMetadata({
      correlationId: command.correlationId,
      serviceToken: this.options.serviceToken,
    });
    const deadline = createGrpcDeadline(
      this.clock,
      agentRuntimeTaskDeadlineTimeoutMs(command.timeoutMs),
    );

    return new Promise((resolve, reject) => {
      this.client.runAgentTask(
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
            reject(error);
            return;
          }

          try {
            resolve(fromGrpcTaskResponse(response));
          } catch (parseError) {
            reject(parseError);
          }
        },
      );
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
): AgentRuntimeTaskResult => ({
  status: fromGrpcTaskStatus(response.status),
  outputText: optionalString(response.outputText),
  structuredOutput: parseOptionalJsonObject(response.structuredOutputJson),
  warnings: response.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
  })),
  usage:
    response.usage === undefined
      ? undefined
      : {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens,
          estimatedCostUsd: response.usage.estimatedCostUsd,
        },
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
});

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

const optionalString = (value: string): string | undefined => {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

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
