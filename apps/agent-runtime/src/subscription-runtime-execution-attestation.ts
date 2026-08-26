import {
  agentRuntimeExecutionAttestationSchemaVersion,
  canonicalJsonSha256,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  selectedAgentRuntimeOutput,
  subscriptionRuntimeEngine,
  type AgentRuntimeExecutionAttestation,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
} from "./agent-runtime-executor.port";
import type {
  SubscriptionRuntimeInstallationIdentity,
  SubscriptionRuntimeInstallationInspector,
} from "./subscription-runtime-installation";
import {
  admitSubscriptionRuntimeRequest,
  parseSubscriptionRuntimeJsonObject,
  productionAgentRuntimeModel,
  productionAgentRuntimeReasoningEffort,
  type SubscriptionRuntimePurposeProfile,
} from "./subscription-runtime-purpose-model-policy";

export {
  parseSubscriptionRuntimeJsonObject,
  productionAgentRuntimeModel,
  productionAgentRuntimeReasoningEffort,
};

export const attachExecutorOwnedExecutionAttestation = async (params: {
  readonly command: string;
  readonly request: AgentRuntimeExecutionRequest;
  readonly canonicalRequest: Record<string, unknown>;
  readonly result: AgentRuntimeExecutionResult;
  readonly profile: SubscriptionRuntimePurposeProfile;
  readonly installationInspector: SubscriptionRuntimeInstallationInspector;
  readonly admittedInstallation: SubscriptionRuntimeInstallationIdentity;
}): Promise<AgentRuntimeExecutionResult> => {
  if (params.result.status !== "completed") {
    return params.result;
  }

  try {
    const executionAttestation = await createExecutionAttestation(params);
    return { ...params.result, executionAttestation };
  } catch {
    return invalidAttestationResult();
  }
};

const createExecutionAttestation = async (params: {
  readonly command: string;
  readonly request: AgentRuntimeExecutionRequest;
  readonly canonicalRequest: Record<string, unknown>;
  readonly result: AgentRuntimeExecutionResult;
  readonly profile: SubscriptionRuntimePurposeProfile;
  readonly installationInspector: SubscriptionRuntimeInstallationInspector;
  readonly admittedInstallation: SubscriptionRuntimeInstallationIdentity;
}): Promise<AgentRuntimeExecutionAttestation> => {
  const exactAdmission = admitSubscriptionRuntimeRequest(params.request);
  if (
    params.request.provider !== params.profile.provider ||
    canonicalJsonSha256(params.canonicalRequest) !==
      canonicalJsonSha256(exactAdmission.canonicalRequest) ||
    params.profile.provider !== exactAdmission.profile.provider ||
    params.profile.model !== exactAdmission.profile.model ||
    params.profile.reasoningEffort !==
      exactAdmission.profile.reasoningEffort ||
    params.profile.outputKind !== exactAdmission.profile.outputKind ||
    params.profile.responseFormat !== exactAdmission.profile.responseFormat ||
    params.profile.reasoningEffort !== productionAgentRuntimeReasoningEffort ||
    (params.profile.model !== productionAgentRuntimeModel &&
      params.profile.model !== "gpt-5.6-sol")
  ) {
    throw new Error("Agent runtime execution identity is not production-safe");
  }
  const installation = await params.installationInspector.inspect(
    params.command,
  );
  if (!installationIdentityEqual(params.admittedInstallation, installation)) {
    throw new Error("Agent runtime installation changed during execution");
  }
  if (
    !isConcreteRuntimePackageVersion(installation.runtimePackageVersion) ||
    !isSha256Hex(installation.launcherSha256)
  ) {
    throw new Error("Agent runtime installation identity is malformed");
  }
  const output = selectedAgentRuntimeOutput(params.result);
  if (output.kind !== params.profile.outputKind) {
    throw new Error("Agent runtime output kind conflicts with purpose policy");
  }

  return {
    schemaVersion: agentRuntimeExecutionAttestationSchemaVersion,
    requestId: params.request.requestId,
    purpose: params.request.purpose,
    canonicalRequestSha256: canonicalJsonSha256(params.canonicalRequest),
    provider: params.request.provider,
    model: params.profile.model,
    reasoningEffort: params.profile.reasoningEffort,
    runtimeEngine: subscriptionRuntimeEngine,
    runtimePackageVersion: installation.runtimePackageVersion,
    launcherSha256: installation.launcherSha256,
    selectedOutputKind: output.kind,
    selectedOutputSha256: output.sha256,
  };
};

const installationIdentityEqual = (
  admitted: SubscriptionRuntimeInstallationIdentity,
  completed: SubscriptionRuntimeInstallationIdentity,
): boolean =>
  admitted.executablePath === completed.executablePath &&
  admitted.packageRootRealpath === completed.packageRootRealpath &&
  admitted.runtimePackageVersion === completed.runtimePackageVersion &&
  admitted.launcherSha256 === completed.launcherSha256;

export const invalidAttestationResult = (): AgentRuntimeExecutionResult => ({
  status: "failed",
  warnings: [],
  failure: {
    code: "agent_runtime.execution_attestation_invalid",
    safeMessage: "Agent runtime execution attestation could not be verified",
    retryable: false,
    reconnectRequired: false,
    causeCategory: "runtime_attestation",
    details: {},
  },
});
