import type { AgentRuntimeFailure } from "../../ports";
import type { AgentRuntimeModelFailure } from "./agent-runtime-model-failure";

/** Classify an attested task failure without importing transport-specific clients. */
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

