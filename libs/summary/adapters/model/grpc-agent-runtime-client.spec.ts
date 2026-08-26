import type { ClientUnaryCall, ServiceError } from "@grpc/grpc-js";
import {
  AgentRuntimeProvider,
  AgentRuntimeSelectedOutputKind,
  AgentRuntimeTaskStatus,
  type AgentRuntimeServiceClient,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { AgentRuntimeTaskCommand } from "../../ports";
import {
  agentRuntimeTaskDeadlineTimeoutMs,
  GrpcAgentRuntimeClient,
} from "./grpc-agent-runtime-client";

describe("gRPC agent runtime client", () => {
  it("keeps transport open long enough to receive a typed task timeout", () => {
    expect(agentRuntimeTaskDeadlineTimeoutMs(600_000)).toBe(605_000);
  });

  it("accepts a typed executor attestation bound to the selected output", async () => {
    const result = await clientFor(response()).runTask(command());

    expect(result.executionAttestation).toMatchObject({
      requestId: "request-1",
      selectedOutputKind: "structured_output",
      runtimePackageVersion: "0.1.0-main.2",
    });
  });

  it.each([
    ["missing", (value: AgentRuntimeTaskResponse) => {
      value.executionAttestation = undefined;
    }],
    ["altered output", (value: AgentRuntimeTaskResponse) => {
      value.structuredOutputJson = JSON.stringify({ headline: "altered" });
    }],
    ["mismatched request", (value: AgentRuntimeTaskResponse) => {
      value.executionAttestation!.requestId = "different-request";
    }],
    ["wrong launcher", (value: AgentRuntimeTaskResponse) => {
      value.executionAttestation!.launcherSha256 = "wrong";
    }],
    ["unknown version", (value: AgentRuntimeTaskResponse) => {
      value.executionAttestation!.runtimePackageVersion = "unknown";
    }],
  ] as const)("rejects a %s attestation", async (_label, mutate) => {
    const value = response();
    mutate(value);

    await expect(clientFor(value).runTask(command())).rejects.toThrow(
      /attestation/u,
    );
  });
});

const command = (): AgentRuntimeTaskCommand => ({
  requestId: "request-1",
  tenantId: tenantId("tenant-1"),
  workspaceId: workspaceId("workspace-1"),
  correlationId: "correlation-1",
  provider: "codex",
  purpose: "social_monitor.reader_summary.generate",
  systemPrompt: "Return JSON.",
  prompt: "Summarize.",
  outputSchema: {},
  controls: {},
  timeoutMs: 1_000,
});

const response = (): AgentRuntimeTaskResponse => {
  const structuredOutput = { headline: "ok" };
  return {
    schemaVersion: 1,
    status: AgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_COMPLETED,
    outputText: "",
    structuredOutputJson: JSON.stringify(structuredOutput),
    warnings: [],
    usage: undefined,
    failure: undefined,
    executionAttestation: {
      schemaVersion: 1,
      requestId: "request-1",
      purpose: "social_monitor.reader_summary.generate",
      canonicalRequestSha256: "a".repeat(64),
      provider: AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX,
      model: "gpt-5.5",
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "0.1.0-main.2",
      launcherSha256: "b".repeat(64),
      selectedOutputKind:
        AgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_STRUCTURED_OUTPUT,
      selectedOutputSha256: canonicalJsonSha256(structuredOutput),
    },
  };
};

const clientFor = (responseValue: AgentRuntimeTaskResponse) => {
  const grpcClient = {
    runAgentTask(
      _request: unknown,
      _metadata: unknown,
      _options: unknown,
      callback: (
        error: ServiceError | null,
        response: AgentRuntimeTaskResponse,
      ) => void,
    ): ClientUnaryCall {
      callback(null, responseValue);
      return {} as ClientUnaryCall;
    },
  } as unknown as AgentRuntimeServiceClient;

  return new GrpcAgentRuntimeClient(
    grpcClient,
    { now: () => new Date("2026-07-17T00:00:00.000Z") },
    { timeoutMs: 1_000 },
  );
};
