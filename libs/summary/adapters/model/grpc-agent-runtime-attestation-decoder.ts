import {
  AgentRuntimeProvider as GrpcAgentRuntimeProvider,
  AgentRuntimeSelectedOutputKind as GrpcAgentRuntimeSelectedOutputKind,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type {
  AgentRuntimeExecutionAttestation,
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
} from "../../ports";

/** Bind the attested runtime and selected-output identity to the trusted command. */
const readExecutionAttestation = (
  response: AgentRuntimeTaskResponse,
  command: AgentRuntimeTaskCommand,
): AgentRuntimeExecutionAttestation | undefined => {
  const value = response.executionAttestation;
  if (value === undefined) {
    return undefined;
  }
  const provider = fromGrpcProvider(value.provider);
  const selectedOutputKind = fromGrpcSelectedOutputKind(
    value.selectedOutputKind,
  );
  if (
    value.schemaVersion !== 1 ||
    value.requestId !== command.requestId ||
    value.purpose !== command.purpose ||
    provider !== command.provider ||
    value.model.trim().length === 0 ||
    value.reasoningEffort.trim().length === 0 ||
    value.runtimeEngine !== subscriptionRuntimeEngine ||
    !isConcreteRuntimePackageVersion(value.runtimePackageVersion) ||
    !isSha256Hex(value.canonicalRequestSha256) ||
    !isSha256Hex(value.launcherSha256) ||
    !isSha256Hex(value.selectedOutputSha256)
  ) {
    throw new Error("Agent runtime execution attestation is malformed");
  }
  return {
    schemaVersion: 1,
    requestId: value.requestId,
    purpose: value.purpose,
    canonicalRequestSha256: value.canonicalRequestSha256,
    provider,
    model: value.model,
    reasoningEffort: value.reasoningEffort,
    runtimeEngine: subscriptionRuntimeEngine,
    runtimePackageVersion: value.runtimePackageVersion,
    launcherSha256: value.launcherSha256,
    selectedOutputKind,
    selectedOutputSha256: value.selectedOutputSha256,
  };
};

const fromGrpcProvider = (
  provider: GrpcAgentRuntimeProvider,
): AgentRuntimeProvider => {
  switch (provider) {
    case GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX:
      return "codex";
    case GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CLAUDE:
      return "claude";
    case GrpcAgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_UNSPECIFIED:
    case GrpcAgentRuntimeProvider.UNRECOGNIZED:
      throw new Error("Attested agent runtime provider is unspecified");
  }
};

const fromGrpcSelectedOutputKind = (
  kind: GrpcAgentRuntimeSelectedOutputKind,
): AgentRuntimeExecutionAttestation["selectedOutputKind"] => {
  switch (kind) {
    case GrpcAgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_STRUCTURED_OUTPUT:
      return "structured_output";
    case GrpcAgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_OUTPUT_TEXT:
      return "output_text";
    case GrpcAgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_UNSPECIFIED:
    case GrpcAgentRuntimeSelectedOutputKind.UNRECOGNIZED:
      throw new Error("Attested agent runtime output kind is unspecified");
  }
};

export { readExecutionAttestation };
