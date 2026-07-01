import { status, type sendUnaryData, type ServerUnaryCall } from "@grpc/grpc-js";
import {
  AgentRuntimeHealthStatus,
  AgentRuntimeProvider,
  type AgentRuntimeHealthRequest,
  type AgentRuntimeHealthResponse,
  type AgentRuntimeServiceServer,
  type AgentRuntimeTaskRequest,
  type AgentRuntimeTaskResponse,
  AgentRuntimeTaskStatus,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";

import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutorPort,
} from "./agent-runtime-executor.port";

export type AgentRuntimeGrpcServiceOptions = {
  readonly serviceToken?: string;
};

const schemaVersion = 1;

export const createAgentRuntimeGrpcService = (
  executor: AgentRuntimeExecutorPort,
  options: AgentRuntimeGrpcServiceOptions,
): AgentRuntimeServiceServer => ({
  runAgentTask(
    call: ServerUnaryCall<AgentRuntimeTaskRequest, AgentRuntimeTaskResponse>,
    callback: sendUnaryData<AgentRuntimeTaskResponse>,
  ): void {
    if (!isAuthorized(call, options.serviceToken)) {
      callback(serviceError(status.UNAUTHENTICATED, "Unauthorized"), null);
      return;
    }

    let request: AgentRuntimeExecutionRequest;
    try {
      request = toExecutionRequest(call.request);
    } catch (error) {
      callback(
        serviceError(
          status.INVALID_ARGUMENT,
          error instanceof Error ? error.message : "Invalid agent task request",
        ),
        null,
      );
      return;
    }

    void executor.execute(request).then(
      (result) => callback(null, toGrpcTaskResponse(result)),
      (error) =>
        callback(
          serviceError(
            status.UNAVAILABLE,
            error instanceof Error
              ? safeErrorMessage(error.message)
              : "Agent runtime task failed",
          ),
          null,
        ),
    );
  },

  checkHealth(
    call: ServerUnaryCall<AgentRuntimeHealthRequest, AgentRuntimeHealthResponse>,
    callback: sendUnaryData<AgentRuntimeHealthResponse>,
  ): void {
    if (!isAuthorized(call, options.serviceToken)) {
      callback(serviceError(status.UNAUTHENTICATED, "Unauthorized"), null);
      return;
    }

    void executor.checkHealth().then(
      (health) =>
        callback(null, {
          status: health.healthy
            ? AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_SERVING
            : AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_DEGRADED,
          runtimeEngine: health.runtimeEngine,
          runtimeVersion: health.runtimeVersion,
          warnings: health.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        }),
      () =>
        callback(null, {
          status:
            AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_NOT_SERVING,
          runtimeEngine: "subscription-runtime-cli",
          runtimeVersion: "unknown",
          warnings: [
            {
              code: "agent_runtime.health_failed",
              message: "Agent runtime health check failed",
            },
          ],
        }),
    );
  },
});

const toExecutionRequest = (
  request: AgentRuntimeTaskRequest,
): AgentRuntimeExecutionRequest => {
  if (request.schemaVersion !== schemaVersion) {
    throw new Error("Unsupported agent runtime schema version");
  }
  if (request.requestId.trim().length === 0) {
    throw new Error("Agent runtime request_id must be non-empty");
  }
  if (request.tenantId.trim().length === 0) {
    throw new Error("Agent runtime tenant_id must be non-empty");
  }
  if (request.workspaceId.trim().length === 0) {
    throw new Error("Agent runtime workspace_id must be non-empty");
  }
  if (request.correlationId.trim().length === 0) {
    throw new Error("Agent runtime correlation_id must be non-empty");
  }
  if (request.prompt.trim().length === 0) {
    throw new Error("Agent runtime prompt must be non-empty");
  }
  if (request.timeoutMs < 1) {
    throw new Error("Agent runtime timeout_ms must be positive");
  }

  return {
    requestId: request.requestId,
    tenantId: request.tenantId,
    workspaceId: request.workspaceId,
    correlationId: request.correlationId,
    provider: fromGrpcProvider(request.provider),
    providerInstanceId: optionalString(request.providerInstanceId),
    purpose: nonEmptyOrFallback(request.purpose, "social_monitor.agent_task"),
    systemPrompt: request.systemPrompt,
    prompt: request.prompt,
    outputSchemaJson: request.outputSchemaJson,
    controlsJson: nonEmptyOrFallback(request.controlsJson, "{}"),
    timeoutMs: request.timeoutMs,
    cwd: optionalString(request.cwd),
    metadata: request.metadata,
  };
};

const toGrpcTaskResponse = (
  result: AgentRuntimeExecutionResult,
): AgentRuntimeTaskResponse => ({
  schemaVersion,
  status: toGrpcTaskStatus(result.status),
  outputText: result.outputText ?? "",
  structuredOutputJson:
    result.structuredOutput === undefined
      ? ""
      : JSON.stringify(result.structuredOutput),
  warnings: result.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
  })),
  usage:
    result.usage === undefined
      ? undefined
      : {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          estimatedCostUsd: result.usage.estimatedCostUsd,
        },
  failure:
    result.failure === undefined
      ? undefined
      : {
          code: result.failure.code,
          safeMessage: result.failure.safeMessage,
          retryable: result.failure.retryable,
          reconnectRequired: result.failure.reconnectRequired,
          causeCategory: result.failure.causeCategory,
          details: result.failure.details,
        },
});

const fromGrpcProvider = (
  provider: AgentRuntimeProvider,
): AgentRuntimeExecutionRequest["provider"] => {
  switch (provider) {
    case AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX:
      return "codex";
    case AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CLAUDE:
      return "claude";
    case AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_UNSPECIFIED:
    case AgentRuntimeProvider.UNRECOGNIZED:
      throw new Error("Agent runtime provider must be codex or claude");
  }
};

const toGrpcTaskStatus = (
  value: AgentRuntimeExecutionResult["status"],
): AgentRuntimeTaskStatus => {
  switch (value) {
    case "completed":
      return AgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_COMPLETED;
    case "waiting_for_input":
      return AgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_WAITING_FOR_INPUT;
    case "failed":
      return AgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_FAILED;
  }
};

const isAuthorized = (
  call: ServerUnaryCall<unknown, unknown>,
  serviceToken: string | undefined,
): boolean => {
  if (serviceToken === undefined) {
    return true;
  }

  const authorization = call.metadata.get("authorization");
  return authorization.includes(`Bearer ${serviceToken}`);
};

const serviceError = (code: status, message: string): Error & { code: status } =>
  Object.assign(new Error(message), { code });

const optionalString = (value: string): string | undefined => {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const nonEmptyOrFallback = (value: string, fallback: string): string => {
  const trimmed = value.trim();

  return trimmed.length === 0 ? fallback : trimmed;
};

const safeErrorMessage = (message: string): string =>
  message.trim().length === 0
    ? "Agent runtime task failed"
    : message.slice(0, 200);
