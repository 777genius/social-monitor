import type { AgentRuntimeProvider } from "@social-monitor/summary/ports";

export type AgentRuntimeExecutionRequest = {
  readonly requestId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly provider: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly purpose: string;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly outputSchemaJson: string;
  readonly controlsJson: string;
  readonly timeoutMs: number;
  readonly cwd?: string;
  readonly metadata: Readonly<Record<string, string>>;
};

export type AgentRuntimeExecutionWarning = {
  readonly code: string;
  readonly message: string;
};

export type AgentRuntimeExecutionUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
};

export type AgentRuntimeExecutionFailure = {
  readonly code: string;
  readonly safeMessage: string;
  readonly retryable: boolean;
  readonly reconnectRequired: boolean;
  readonly causeCategory: string;
  readonly details: Readonly<Record<string, string>>;
};

export type AgentRuntimeExecutionResult = {
  readonly status: "completed" | "failed" | "waiting_for_input";
  readonly outputText?: string;
  readonly structuredOutput?: Record<string, unknown>;
  readonly warnings: readonly AgentRuntimeExecutionWarning[];
  readonly usage?: AgentRuntimeExecutionUsage;
  readonly failure?: AgentRuntimeExecutionFailure;
};

export type AgentRuntimeExecutorHealth = {
  readonly healthy: boolean;
  readonly runtimeEngine: string;
  readonly runtimeVersion: string;
  readonly warnings: readonly AgentRuntimeExecutionWarning[];
};

export interface AgentRuntimeExecutorPort {
  execute(
    request: AgentRuntimeExecutionRequest,
  ): Promise<AgentRuntimeExecutionResult>;
  checkHealth(): Promise<AgentRuntimeExecutorHealth>;
}
