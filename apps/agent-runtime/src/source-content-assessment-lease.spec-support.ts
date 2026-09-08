import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";

export const assessmentRequest = (requestId = "synthetic-task-a"): AgentRuntimeExecutionRequest => ({
  requestId, tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace",
  correlationId: "synthetic-correlation", provider: "codex",
  purpose: "social_monitor.relevance.assess_source_content.v1",
  systemPrompt: "Return synthetic JSON.", prompt: "Synthetic assessment.",
  outputSchemaJson: '{"type":"object"}', controlsJson: '{}', timeoutMs: 100,
  metadata: {},
});

export const syntheticInstallation = {
  executablePath: "/synthetic/runtime-cli", runtimePackageVersion: "0.1.0-main.41",
  launcherSha256: "a".repeat(64),
};
