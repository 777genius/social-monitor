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

/**
 * The paid output is discarded: an attestation must never bind a model the
 * provider did not confirm. Retrying is the caller's paid decision.
 */
export const gatewayLlmModelMismatch = (
  identity: GatewayLlmAttemptIdentity,
): AgentRuntimeFailure => ({
  code: "provider_model_mismatch",
  safeMessage: "Provider reported a different model than requested",
  retryable: false,
  reconnectRequired: false,
  causeCategory: "model_identity",
  details: { gatewayEffect: "completed", gatewayTaskId: identity.taskId,
    gatewayAttempt: String(identity.attempt) },
});

/** Local failures before any gateway call; nothing was dispatched or paid. */
export const gatewayLlmLocalFailure = (
  code: "invalid_request" | "unsupported_route" | "invalid_schema",
  safeMessage: string,
): AgentRuntimeFailure => ({
  code,
  safeMessage,
  retryable: false,
  reconnectRequired: false,
  causeCategory: code === "invalid_schema" ? "output_schema" : "invalid_request",
  details: { gatewayEffect: "not_dispatched" },
});
