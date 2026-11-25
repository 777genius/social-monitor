import type { LlmSuccess } from "@agent-teams/account-gateway/llm";
import { observedModelMatches } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../../ports";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";
import { gatewayLlmModelMismatch } from "./gateway-llm-failure";
import { gatewayLlmCompletionAttestation } from "./gateway-llm-completion-attestation";
import { gatewayLlmCompletionWarnings } from "./gateway-llm-settlement-warnings";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";
import type { GatewayLlmPrepared } from "./gateway-llm-task-preparation";
import { gatewayLlmUsage } from "./gateway-llm-usage";

/** Build the runtime result and attestation only after the observed model matches.
 * A mismatching receipt never produces an execution attestation.
 */
export const completeGatewayLlmTask = (
  command: AgentRuntimeTaskCommand,
  prepared: GatewayLlmPrepared,
  identity: GatewayLlmAttemptIdentity,
  result: LlmSuccess<Record<string, unknown>>,
  durationMs: number,
  sdk: GatewayLlmSdkIdentity,
): AgentRuntimeTaskResult => {
  const receipt = result.receipt;
  if (!observedModelMatches(prepared.task.model, receipt.observedModel)) {
    return { status: "failed", warnings: [], failure: gatewayLlmModelMismatch(identity),
      durationMs, ...gatewayLlmUsage(result.usage) };
  }
  const output = prepared.structured
    ? { structuredOutput: result.value } : { outputText: result.text };
  return {
    status: "completed",
    ...output,
    warnings: gatewayLlmCompletionWarnings(result, command, durationMs),
    ...gatewayLlmUsage(result.usage),
    durationMs,
    executionAttestation: gatewayLlmCompletionAttestation(
      command, prepared, receipt, output, sdk,
    ),
  };
};
