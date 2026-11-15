import {
  AgentRuntimeHealthStatus as GrpcAgentRuntimeHealthStatus,
  AgentRuntimeProvider as GrpcAgentRuntimeProvider,
  AgentRuntimeTaskStatus as GrpcAgentRuntimeTaskStatus,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  executionAttestationOutputMatches,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { readExecutionAttestation } from "./grpc-agent-runtime-attestation-decoder";
import { readGrpcUsage, readOptionalDurationMs } from "./grpc-agent-runtime-measurement-decoder";
import type {
  AgentRuntimeHealthStatus,
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  AgentRuntimeTaskStatus,
} from "../../ports";

export const agentRuntimeWireSchemaVersion = 1;

export const toGrpcProvider = (
  provider: AgentRuntimeProvider,
): GrpcAgentRuntimeProvider => {
  switch (provider) {
    case "codex":
      return GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX;
    case "claude":
      return GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CLAUDE;
  }
};

export const fromGrpcTaskResponse = (
  response: AgentRuntimeTaskResponse,
  command: AgentRuntimeTaskCommand,
): AgentRuntimeTaskResult => {
  if (response.schemaVersion !== agentRuntimeWireSchemaVersion) {
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

export const fromGrpcHealthStatus = (
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
