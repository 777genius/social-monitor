import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type AgentRuntimeProvider = "codex" | "claude";

export type AgentRuntimeTaskStatus =
  "completed" | "failed" | "waiting_for_input";

export type AgentRuntimeTaskCommand = {
  readonly requestId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly correlationId: string;
  readonly provider: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly purpose: string;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly outputSchema: Record<string, unknown>;
  readonly controls: Record<string, unknown>;
  readonly timeoutMs: number;
  readonly cwd?: string;
  readonly metadata?: Readonly<Record<string, string>>;
};

export type AgentRuntimeWarning = {
  readonly code: string;
  readonly message: string;
};

export type AgentRuntimeUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
};

export type AgentRuntimeFailure = {
  readonly code: string;
  readonly safeMessage: string;
  readonly retryable: boolean;
  readonly reconnectRequired: boolean;
  readonly causeCategory: string;
  readonly details: Readonly<Record<string, string>>;
};

export type AgentRuntimeExecutionAttestation = {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly purpose: string;
  readonly canonicalRequestSha256: string;
  readonly provider: AgentRuntimeProvider;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly runtimeEngine: "subscription-runtime-cli";
  readonly runtimePackageVersion: string;
  readonly launcherSha256: string;
  readonly selectedOutputKind: "structured_output" | "output_text";
  readonly selectedOutputSha256: string;
};

export type AgentRuntimeTaskResult = {
  readonly status: AgentRuntimeTaskStatus;
  readonly outputText?: string;
  readonly structuredOutput?: Record<string, unknown>;
  readonly warnings: readonly AgentRuntimeWarning[];
  readonly usage?: AgentRuntimeUsage;
  readonly failure?: AgentRuntimeFailure;
  readonly executionAttestation?: AgentRuntimeExecutionAttestation;
};

export type AgentRuntimeHealthStatus = "serving" | "degraded" | "not_serving";

export type AgentRuntimeHealthResult = {
  readonly status: AgentRuntimeHealthStatus;
  readonly runtimeEngine: string;
  readonly runtimeVersion: string;
  readonly launcherSha256?: string;
  readonly warnings: readonly AgentRuntimeWarning[];
};

export interface AgentRuntimeClientPort {
  runTask(
    command: AgentRuntimeTaskCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult>;
  checkHealth(service: string): Promise<AgentRuntimeHealthResult>;
}
