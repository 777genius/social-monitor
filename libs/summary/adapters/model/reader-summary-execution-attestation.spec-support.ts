import { selectedAgentRuntimeOutput } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";

export const withTestExecutionAttestation = (
  command: AgentRuntimeTaskCommand,
  result: AgentRuntimeTaskResult,
): AgentRuntimeTaskResult => {
  if (result.status !== "completed") {
    return result;
  }
  const selected = selectedAgentRuntimeOutput(result);
  return {
    ...result,
    executionAttestation: {
      schemaVersion: 1,
      requestId: command.requestId,
      purpose: command.purpose,
      canonicalRequestSha256: "a".repeat(64),
      provider: command.provider,
      model: command.controls.modelBackend === "xiaomi-mimo-token-plan"
        ? "mimo-v2.6-pro"
        : "gpt-5.6-sol",
      reasoningEffort:
        typeof command.controls.reasoningEffort === "string"
          ? command.controls.reasoningEffort
          : (command.metadata?.reasoningEffort ?? "high"),
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "0.1.0-main.2",
      launcherSha256: "b".repeat(64),
      selectedOutputKind: selected.kind,
      selectedOutputSha256: selected.sha256,
    },
  };
};

/** The attestation GatewayLlmClient returns for a completed Kimi Code task. */
export const withTestGatewayExecutionAttestation = (
  command: AgentRuntimeTaskCommand,
  result: AgentRuntimeTaskResult,
): AgentRuntimeTaskResult => {
  const attested = withTestExecutionAttestation(command, result);
  if (attested.executionAttestation === undefined) return attested;
  const model = typeof command.controls.model === "string" ? command.controls.model : "k3-256k";
  return {
    ...attested,
    executionAttestation: {
      ...attested.executionAttestation,
      model,
      reasoningEffort: typeof command.controls.reasoningEffort === "string"
        ? command.controls.reasoningEffort : "default",
      runtimeEngine: "gateway-llm",
      runtimePackageVersion: "0.1.0-llm.0f3827f",
      launcherSha256: "c".repeat(64),
      gateway: { profileId: "kimi-code-global-responses-apikey-v1", taskId: "sm-task", attempt: 1,
        executionRef: "execution-1", requestRef: "request-1", accountRef: "account-1",
        observedModel: model, requestSha256: "d".repeat(64) },
    },
  };
};
