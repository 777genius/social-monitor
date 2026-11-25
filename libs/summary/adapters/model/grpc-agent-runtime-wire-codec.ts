import {
  AgentRuntimeHealthStatus as GrpcAgentRuntimeHealthStatus,
  AgentRuntimeProvider as GrpcAgentRuntimeProvider,
  AgentRuntimeTaskStatus as GrpcAgentRuntimeTaskStatus,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  assertGrpcTaskOutputTrust,
  readGrpcOptionalOutputText,
  readGrpcOptionalStructuredOutput,
} from "./grpc-agent-runtime-output-trust";
import { readGrpcTaskFailure } from "./grpc-agent-runtime-failure-projection";
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
    outputText: readGrpcOptionalOutputText(response.outputText),
    structuredOutput: readGrpcOptionalStructuredOutput(response.structuredOutputJson),
    warnings: response.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
    usage,
    durationMs,
    failure: readGrpcTaskFailure(response),
    executionAttestation: readExecutionAttestation(response, command),
  };
  assertGrpcTaskOutputTrust(result);
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
