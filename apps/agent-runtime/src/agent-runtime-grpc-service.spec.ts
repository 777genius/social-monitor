import { Metadata, status } from "@grpc/grpc-js";
import {
  AgentRuntimeProvider,
  AgentRuntimeTaskStatus,
  type AgentRuntimeTaskRequest,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";

import { createAgentRuntimeGrpcService } from "./agent-runtime-grpc-service";
import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutorHealth,
  AgentRuntimeExecutorPort,
} from "./agent-runtime-executor.port";

describe("createAgentRuntimeGrpcService", () => {
  it("requires the configured service token", async () => {
    const service = createAgentRuntimeGrpcService(
      new FakeExecutor({
        status: "completed",
        outputText: "{}",
        warnings: [],
      }),
      { serviceToken: "secret-token" },
    );

    const response = await runAgentTask(service, validRequest(), new Metadata());

    expect(response.error).toMatchObject({ code: status.UNAUTHENTICATED });
  });

  it("maps a valid gRPC task request to the executor and response contract", async () => {
    const executor = new FakeExecutor({
      status: "completed",
      structuredOutput: { headline: "ok" },
      warnings: [{ code: "test.warning", message: "Heads up" }],
      executionAttestation: executionAttestation(),
    });
    const service = createAgentRuntimeGrpcService(executor, {
      serviceToken: "secret-token",
    });
    const metadata = new Metadata();
    metadata.set("authorization", "Bearer secret-token");

    const response = await runAgentTask(service, validRequest(), metadata);

    expect(response.error).toBeNull();
    expect(executor.requests[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.summary.generate",
      prompt: "Return JSON.",
    });
    expect(response.value).toMatchObject({
      status: AgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_COMPLETED,
      structuredOutputJson: JSON.stringify({ headline: "ok" }),
      warnings: [{ code: "test.warning", message: "Heads up" }],
      executionAttestation: expect.objectContaining({
        requestId: "request-1",
        runtimePackageVersion: "0.1.0-main.2",
      }),
    });
  });
});

class FakeExecutor implements AgentRuntimeExecutorPort {
  readonly requests: AgentRuntimeExecutionRequest[] = [];

  constructor(private readonly result: AgentRuntimeExecutionResult) {}

  async execute(
    request: AgentRuntimeExecutionRequest,
  ): Promise<AgentRuntimeExecutionResult> {
    this.requests.push(request);
    return this.result;
  }

  async checkHealth(): Promise<AgentRuntimeExecutorHealth> {
    return {
      healthy: true,
      runtimeEngine: "fake",
      runtimeVersion: "test",
      warnings: [],
    };
  }
}

const runAgentTask = async (
  service: ReturnType<typeof createAgentRuntimeGrpcService>,
  request: AgentRuntimeTaskRequest,
  metadata: Metadata,
): Promise<{
  readonly error: Error & { readonly code?: status } | null;
  readonly value?: AgentRuntimeTaskResponse;
}> =>
  new Promise((resolve) => {
    service.runAgentTask(
      {
        request,
        metadata,
      } as Parameters<typeof service.runAgentTask>[0],
      (error, value) =>
        resolve({
          error: error as Error & { readonly code?: status } | null,
          value: value ?? undefined,
        }),
    );
  });

const validRequest = (): AgentRuntimeTaskRequest => ({
  schemaVersion: 1,
  requestId: "request-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  correlationId: "corr-1",
  provider: AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX,
  providerInstanceId: "",
  purpose: "social_monitor.summary.generate",
  systemPrompt: "Return JSON only.",
  prompt: "Return JSON.",
  outputSchemaJson: "{}",
  controlsJson: "{}",
  timeoutMs: 10_000,
  cwd: "",
  metadata: {},
});

const executionAttestation = () => ({
  schemaVersion: 1 as const,
  requestId: "request-1",
  purpose: "social_monitor.summary.generate",
  canonicalRequestSha256: "a".repeat(64),
  provider: "codex" as const,
  model: "gpt-5.5",
  reasoningEffort: "xhigh",
  runtimeEngine: "subscription-runtime-cli" as const,
  runtimePackageVersion: "0.1.0-main.2",
  launcherSha256: "b".repeat(64),
  selectedOutputKind: "structured_output" as const,
  selectedOutputSha256: "c".repeat(64),
});
