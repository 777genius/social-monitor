import { status } from "@grpc/grpc-js";
import { grpcStatusCodeOf, isGrpcRetryableStatus } from "@social-monitor/platform-grpc";

export type AgentRuntimeModelFailureKind =
  | "budget_exceeded"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "invalid_schema"
  | "citation_validation_failed"
  | "context_too_large"
  | "unsafe_or_refused"
  | "unknown";

export type AgentRuntimeModelFailure = {
  readonly kind: AgentRuntimeModelFailureKind;
  readonly retryable: boolean;
  readonly message: string;
};

export class AgentRuntimeModelProviderError extends Error {
  constructor(readonly failure: AgentRuntimeModelFailure) {
    super(failure.message);
  }
}

export const classifyAgentRuntimeError = (
  error: unknown,
  fallbackMessage: string,
): AgentRuntimeModelFailure => {
  if (error instanceof AgentRuntimeModelProviderError) {
    return error.failure;
  }

  const grpcStatus = grpcStatusCodeOf(error);
  if (grpcStatus !== undefined) {
    return {
      kind:
        grpcStatus === status.RESOURCE_EXHAUSTED
          ? "provider_rate_limited"
          : "provider_unavailable",
      retryable: isGrpcRetryableStatus(grpcStatus),
      message:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : fallbackMessage,
    };
  }

  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallbackMessage;
  const lower = message.toLowerCase();

  if (lower.includes("budget")) {
    return { kind: "budget_exceeded", retryable: false, message };
  }
  if (lower.includes("citation")) {
    return { kind: "citation_validation_failed", retryable: false, message };
  }
  if (lower.includes("schema") || lower.includes("json")) {
    return { kind: "invalid_schema", retryable: false, message };
  }
  if (lower.includes("rate") || lower.includes("quota")) {
    return { kind: "provider_rate_limited", retryable: true, message };
  }

  return { kind: "unknown", retryable: false, message };
};

export { mapAgentRuntimeFailure } from "./agent-runtime-model-task-failure";
