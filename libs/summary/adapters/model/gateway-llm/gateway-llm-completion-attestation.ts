import type { LlmSuccess } from "@agent-teams/account-gateway/llm";
import {
  gatewayLlmRuntimeEngine, selectedAgentRuntimeOutput,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../../ports";
import type { GatewayLlmPrepared } from "./gateway-llm-task-preparation";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";
import { gatewayLlmCanonicalRequestSha256 } from "./gateway-llm-request-identity";

/**
 * Seal the selected, already validated provider output to the exact request and
 * SDK receipt. The caller must veto an observed-model mismatch before invoking
 * this policy; the failure path never mints an execution attestation.
 */
export const gatewayLlmCompletionAttestation = (
  command: AgentRuntimeTaskCommand,
  prepared: GatewayLlmPrepared,
  receipt: LlmSuccess<Record<string, unknown>>["receipt"],
  output: Parameters<typeof selectedAgentRuntimeOutput>[0],
  sdk: GatewayLlmSdkIdentity,
): NonNullable<AgentRuntimeTaskResult["executionAttestation"]> => {
  const selected = selectedAgentRuntimeOutput(output);
  return {
    schemaVersion: 1,
    requestId: command.requestId,
    purpose: command.purpose,
    canonicalRequestSha256: gatewayLlmCanonicalRequestSha256(command, prepared.route),
    provider: command.provider,
    model: prepared.task.model,
    reasoningEffort: prepared.reasoningEffort,
    runtimeEngine: gatewayLlmRuntimeEngine,
    runtimePackageVersion: sdk.packageVersion,
    launcherSha256: sdk.archiveSha256,
    gateway: {
      profileId: receipt.profileId, taskId: receipt.taskId, attempt: receipt.attempt,
      executionRef: receipt.executionRef, requestRef: receipt.requestRef,
      accountRef: receipt.accountRef, observedModel: receipt.observedModel,
      requestSha256: receipt.requestSha256,
    },
    selectedOutputKind: selected.kind,
    selectedOutputSha256: selected.sha256,
  };
};
