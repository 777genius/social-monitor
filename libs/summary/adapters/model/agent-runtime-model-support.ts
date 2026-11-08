import type { AgentRuntimeTaskResult } from "../../ports";
import {
  AgentRuntimeModelProviderError,
  mapAgentRuntimeFailure,
} from "./agent-runtime-model-failure";
export {
  AgentRuntimeModelProviderError,
  classifyAgentRuntimeError,
  type AgentRuntimeModelFailure,
  type AgentRuntimeModelFailureKind,
} from "./agent-runtime-model-failure";
export {
  usageFromAgentRuntime,
  sumReaderSummaryUsage,
  assertReaderSummaryRepairWithinBudget,
  type AgentRuntimeModelEstimate,
} from "./agent-runtime-model-usage";

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

