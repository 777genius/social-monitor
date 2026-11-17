import type { LlmFailure } from "@agent-teams/account-gateway/llm";

import type { AgentRuntimeFailure } from "../../../ports";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";
import { gatewayLlmFailureShape } from "./gateway-llm-failure-taxonomy";
import { gatewayLlmFailureAttemptDetails } from "./gateway-llm-failure-attempt-details";
import {
  gatewayLlmOutputViolationDetails,
  type GatewayLlmOutputViolations,
} from "./gateway-llm-failure-output-diagnostics";
export type { GatewayLlmOutputViolations } from "./gateway-llm-failure-output-diagnostics";

export const gatewayLlmFailure = (
  failure: LlmFailure,
  identity: GatewayLlmAttemptIdentity,
  outputViolations?: GatewayLlmOutputViolations,
): AgentRuntimeFailure => {
  const shape = gatewayLlmFailureShape(failure.code);
  const retry = failure.retry;
  return {
    code: shape.code,
    safeMessage: shape.safeMessage,
    retryable: retry.kind !== "never",
    reconnectRequired: shape.reconnectRequired === true,
    causeCategory: shape.causeCategory,
    details: {
      ...shape.details,
      ...gatewayLlmOutputViolationDetails(failure.code, outputViolations),
      ...gatewayLlmFailureAttemptDetails(failure, identity),
    },
  };
};

// Preserve the legacy named function objects for existing importers.
export { gatewayLlmModelMismatch } from "./gateway-llm-failure-model-identity";
export { gatewayLlmLocalFailure } from "./gateway-llm-failure-preflight";
