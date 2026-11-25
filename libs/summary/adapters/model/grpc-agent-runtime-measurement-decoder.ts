import type { AgentRuntimeTaskResponse } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import type { AgentRuntimeTaskResult } from "../../ports";

/** Validate untrusted wire usage and duration before exposing model accounting. */
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

export { readGrpcUsage, readOptionalDurationMs };
