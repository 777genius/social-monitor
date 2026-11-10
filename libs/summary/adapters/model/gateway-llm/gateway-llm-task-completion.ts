import type { LlmSuccess } from "@agent-teams/account-gateway/llm";
import {
  gatewayLlmRuntimeEngine, observedModelMatches, selectedAgentRuntimeOutput,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../../ports";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";
import { gatewayLlmModelMismatch } from "./gateway-llm-failure";
import { gatewayLlmCanonicalRequestSha256 } from "./gateway-llm-request-identity";
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
  const selected = selectedAgentRuntimeOutput(output);
  return {
    status: "completed",
    ...output,
    warnings: [
      ...(result.cleanup === "pending" ? [{ code: "gateway_cleanup_pending",
        message: "Gateway execution close was not acknowledged" }] : []),
      ...(durationMs > command.timeoutMs ? [{ code: "gateway_settlement_grace_used",
        message: "Gateway task settled after its nominal timeout" }] : []),
    ],
    ...gatewayLlmUsage(result.usage),
    durationMs,
    executionAttestation: {
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
    },
  };
};
