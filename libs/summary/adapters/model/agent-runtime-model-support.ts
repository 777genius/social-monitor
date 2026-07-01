import { status } from "@grpc/grpc-js";
import {
  grpcStatusCodeOf,
  isGrpcRetryableStatus,
} from "@social-monitor/platform-grpc";

import type {
  AgentRuntimeFailure,
  AgentRuntimeTaskResult,
  AgentRuntimeUsage,
} from "../../ports";

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

export type AgentRuntimeModelEstimate = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export const readAgentRuntimeObjectOutput = (
  result: AgentRuntimeTaskResult,
  parseOutputText: (value: string) => Record<string, unknown>,
  label: string,
): Record<string, unknown> => {
  if (result.status === "waiting_for_input") {
    throw new AgentRuntimeModelProviderError({
      kind: "unsafe_or_refused",
      retryable: false,
      message: `${label} agent task requested interactive input`,
    });
  }

  if (result.status === "failed") {
    throw new AgentRuntimeModelProviderError(
      mapAgentRuntimeFailure(result.failure, `${label} agent task failed`),
    );
  }

  if (result.structuredOutput !== undefined) {
    return result.structuredOutput;
  }

  if (result.outputText !== undefined) {
    return parseOutputText(result.outputText);
  }

  throw new AgentRuntimeModelProviderError({
    kind: "unsafe_or_refused",
    retryable: false,
    message: `${label} agent task returned no structured output`,
  });
};

export const usageFromAgentRuntime = (
  usage: AgentRuntimeUsage | undefined,
  estimate: AgentRuntimeModelEstimate,
): AgentRuntimeModelEstimate => {
  if (usage === undefined) {
    return estimate;
  }

  return {
    inputTokens: nonNegativeIntegerOrFallback(
      usage.inputTokens,
      estimate.inputTokens,
    ),
    outputTokens: nonNegativeIntegerOrFallback(
      usage.outputTokens,
      estimate.outputTokens,
    ),
    estimatedCostUsd:
      Number.isFinite(usage.estimatedCostUsd) && usage.estimatedCostUsd >= 0
        ? usage.estimatedCostUsd
        : estimate.estimatedCostUsd,
  };
};

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

export const buildAgentRuntimeRequestId = (
  purpose: string,
  tenantId: unknown,
  workspaceId: unknown,
  scope: string,
  requestedAt: Date,
): string =>
  [purpose, tenantId, workspaceId, scope, requestedAt.toISOString()]
    .map((part) => String(part).replace(/[^a-zA-Z0-9:._-]+/gu, "_"))
    .join(":")
    .slice(0, 240);

export const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

export const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  Number.isInteger(value) && value !== undefined && value > 0
    ? value
    : fallback;

export const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const mapAgentRuntimeFailure = (
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
  const message =
    failure.safeMessage.trim().length > 0
      ? failure.safeMessage
      : fallbackMessage;

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

const nonNegativeIntegerOrFallback = (
  value: number,
  fallback: number,
): number =>
  Number.isInteger(value) && value >= 0
    ? value
    : fallback;
