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
      model: "gpt-5.6-sol",
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
