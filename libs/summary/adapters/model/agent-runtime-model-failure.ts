import { status } from "@grpc/grpc-js";
import { grpcStatusCodeOf, isGrpcRetryableStatus } from "@social-monitor/platform-grpc";
import type { AgentRuntimeFailure } from "../../ports";

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

export const mapAgentRuntimeFailure = (
  failure: AgentRuntimeFailure | undefined,
  fallbackMessage: string,
): AgentRuntimeModelFailure => {
  if (failure === undefined) {
    return {
      kind: "provider_unavailable",
      retryable: true,
      message: fallbackMessage,
    };
  }

  const marker = [
    failure.code,
    failure.causeCategory,
    failure.safeMessage,
  ].join(" ").toLowerCase();
  // The rejected schema path names the broken field in the job failure reason;
  // it stays out of the marker so a field name cannot change the failure kind.
  const violationPath = failure.details?.outputValidationPath;
  const message =
    (failure.safeMessage.trim().length > 0
      ? failure.safeMessage
      : fallbackMessage) + (violationPath === undefined ? "" : ` at ${violationPath}`);

  if (marker.includes("rate") || marker.includes("quota")) {
    return {
      kind: "provider_rate_limited",
      retryable: failure.retryable,
      message,
    };
  }

  if (
    marker.includes("context") ||
    marker.includes("too_large") ||
    marker.includes("token")
  ) {
    return {
      kind: "context_too_large",
      retryable: false,
      message,
    };
  }

  if (marker.includes("schema") || marker.includes("json")) {
    return {
      kind: "invalid_schema",
      retryable: false,
      message,
    };
  }

  if (
    marker.includes("refus") ||
    marker.includes("safety") ||
    marker.includes("interactive")
  ) {
    return {
      kind: "unsafe_or_refused",
      retryable: false,
      message,
    };
  }

  return {
    kind: failure.retryable ? "provider_unavailable" : "unknown",
    retryable: failure.retryable || failure.reconnectRequired,
    message,
  };
};

