import type { AgentRuntimeFailure } from "../../../ports";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";

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
