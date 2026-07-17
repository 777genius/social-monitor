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

export const productionAgentRuntimeModel = "gpt-5.5";
export const productionAgentRuntimeReasoningEffort = "xhigh";

export const canonicalSubscriptionRuntimeRequest = (
  request: AgentRuntimeExecutionRequest,
): Record<string, unknown> => {
  const controls = parseControls(request.controlsJson);
  return {
    protocolVersion: 1,
    runId: request.requestId,
    providerInstanceId: request.providerInstanceId,
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
    task: {
      kind: "structured-prompt",
      systemPrompt: request.systemPrompt,
      prompt: request.prompt,
      outputSchemaName:
        typeof controls.outputSchemaName === "string"
          ? controls.outputSchemaName
          : undefined,
      controls: {
        ...controls,
        responseFormat: "json",
        outputSchemaJson: request.outputSchemaJson,
      },
      metadata: request.metadata,
    },
    context: {
      application: "social-monitor",
      purpose: request.purpose,
      correlationId: request.correlationId,
      metadata: {
        tenantId: request.tenantId,
        workspaceId: request.workspaceId,
      },
    },
  };
};

export const attachExecutorOwnedExecutionAttestation = async (params: {
  readonly command: string;
  readonly request: AgentRuntimeExecutionRequest;
  readonly canonicalRequest: Record<string, unknown>;
  readonly result: AgentRuntimeExecutionResult;
  readonly model: string;
  readonly reasoningEffort: string;
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
  readonly model: string;
  readonly reasoningEffort: string;
  readonly installationInspector: SubscriptionRuntimeInstallationInspector;
  readonly admittedInstallation: SubscriptionRuntimeInstallationIdentity;
}): Promise<AgentRuntimeExecutionAttestation> => {
  if (
    params.request.provider !== "codex" ||
    params.model !== productionAgentRuntimeModel ||
    params.reasoningEffort !== productionAgentRuntimeReasoningEffort
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

  return {
    schemaVersion: agentRuntimeExecutionAttestationSchemaVersion,
    requestId: params.request.requestId,
    purpose: params.request.purpose,
    canonicalRequestSha256: canonicalJsonSha256(params.canonicalRequest),
    provider: params.request.provider,
    model: params.model,
    reasoningEffort: params.reasoningEffort,
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

const parseControls = (value: string): Record<string, unknown> => {
  return parseSubscriptionRuntimeJsonObject(value, "controls_json");
};

export const parseSubscriptionRuntimeJsonObject = (
  value: string,
  label: string,
): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(`${label} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `${label} must be JSON`,
    );
  }
};
