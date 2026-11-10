import {
  AgentRuntimeHealthStatus as GrpcAgentRuntimeHealthStatus,
  AgentRuntimeProvider as GrpcAgentRuntimeProvider,
  AgentRuntimeSelectedOutputKind as GrpcAgentRuntimeSelectedOutputKind,
  AgentRuntimeTaskStatus as GrpcAgentRuntimeTaskStatus,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  executionAttestationOutputMatches,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type {
  AgentRuntimeExecutionAttestation,
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
