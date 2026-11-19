import type { ClientUnaryCall, ServiceError } from "@grpc/grpc-js";
import {
  AgentRuntimeProvider,
  AgentRuntimeSelectedOutputKind,
  AgentRuntimeTaskStatus,
  AgentRuntimeTaskRequest,
  type AgentRuntimeServiceClient,
  type AgentRuntimeTaskResponse,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { AgentRuntimeTaskCommand } from "../../ports";
import {
  agentRuntimeTaskDeadlineTimeoutMs,
  GrpcAgentRuntimeClient,
  validateAgentRuntimeDefaultCwd,
} from "./grpc-agent-runtime-client";
import {
  buildGrpcAgentRuntimeTaskRequest,
  validateAgentRuntimeDefaultCwd as validateRequestDefaultCwd,
} from "./grpc-agent-runtime-task-request";

describe("gRPC agent runtime client", () => {
  it("keeps public default-cwd admission identical to the request owner's policy", () => {
    expect(validateAgentRuntimeDefaultCwd).toBe(validateRequestDefaultCwd);
    expect(validateRequestDefaultCwd("/srv/host/project")).toBe("/srv/host/project");
    expect(validateRequestDefaultCwd("/")).toBe("/");
    expect(() => validateRequestDefaultCwd("/srv/project\u0000escape"))
      .toThrow("Agent runtime default cwd must be a lexical absolute path");
  });

  it("sends the configured host cwd only when a command omits cwd", async () => {
    const requests: AgentRuntimeTaskRequest[] = [];
    const transport = {
      runAgentTask(request: AgentRuntimeTaskRequest, _metadata: unknown, _options: unknown,
        callback: (error: ServiceError | null, response: AgentRuntimeTaskResponse) => void): ClientUnaryCall {
        requests.push(AgentRuntimeTaskRequest.decode(AgentRuntimeTaskRequest.encode(request).finish()));
        callback(null, response());
        return {} as ClientUnaryCall;
      },
    } as unknown as AgentRuntimeServiceClient;
    const makeClient = (defaultCwd?: string) => new GrpcAgentRuntimeClient(
      transport, { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000, defaultCwd },
    );

    await makeClient("/srv/host/project").runTask(command());
    await makeClient("/srv/host/project").runTask({ ...command(), cwd: "/explicit/project" });
    await makeClient("/srv/host/project").runTask({ ...command(), cwd: "" });
    await makeClient().runTask(command());
    expect(requests.map((request) => request.cwd)).toEqual([
      "/srv/host/project", "/explicit/project", "", "",
    ]);
  });

  it.each(["", "relative", " /srv/project", "/srv/../project", "/srv/./project", "/srv//project", "/srv/project/"])(
    "rejects malformed configured default cwd %j before transport", (defaultCwd) => {
      expect(() => new GrpcAgentRuntimeClient(
        {} as AgentRuntimeServiceClient,
        { now: () => new Date("2026-07-17T00:00:00.000Z") },
        { timeoutMs: 1_000, defaultCwd },
      )).toThrow(/cwd/u);
    },
  );

  it("projects immutable tenant-scoped command fields to the typed gRPC request", () => {
    const original = Object.freeze({
      ...command(),
      outputSchema: Object.freeze({}),
      controls: Object.freeze({}),
      metadata: Object.freeze({ trace: "synthetic" }),
    });
    const built = buildGrpcAgentRuntimeTaskRequest(original, "/srv/default");

    expect(AgentRuntimeTaskRequest.decode(AgentRuntimeTaskRequest.encode(built).finish())).toMatchObject({
      schemaVersion: 1,
      requestId: original.requestId,
      tenantId: String(original.tenantId),
      workspaceId: String(original.workspaceId),
      correlationId: original.correlationId,
      provider: AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX,
      purpose: original.purpose,
      systemPrompt: original.systemPrompt,
      prompt: original.prompt,
      outputSchemaJson: "{}",
      controlsJson: "{}",
      timeoutMs: original.timeoutMs,
      cwd: "/srv/default",
      metadata: { trace: "synthetic" },
    });
    expect(original.metadata).toEqual({ trace: "synthetic" });
    expect(original.outputSchema).toEqual({});
    expect(original.controls).toEqual({});
  });

  it("keeps an explicit empty cwd and Claude provider without applying host defaults", () => {
    const original = Object.freeze({ ...command(), provider: "claude" as const, cwd: "" });
    const built = buildGrpcAgentRuntimeTaskRequest(original, "/srv/host");
    expect(built.provider).toBe(AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CLAUDE);
    expect(built.cwd).toBe("");
    expect(built.providerInstanceId).toBe("");
    expect(built.metadata).toEqual({});
    expect(original.cwd).toBe("");
  });

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
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 5,
      totalTokens: 17,
      estimatedCostUsd: 0,
    });
    expect(result.durationMs).toBe(25);
  });

  it("rejects inconsistent provider usage totals", async () => {
    const value = response();
    value.usage!.totalTokens = 99;

    await expect(clientFor(value).runTask(command())).rejects.toThrow(
      /usage is malformed/u,
    );
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

  it("cancels an abort that fires before the transport returns its call handle", async () => {
    const controller = new AbortController();
    let cancelCount = 0;
    const transport = {
      runAgentTask(): ClientUnaryCall {
        controller.abort();
        return { cancel: () => { cancelCount += 1; } } as ClientUnaryCall;
      },
    } as unknown as AgentRuntimeServiceClient;
    const client = new GrpcAgentRuntimeClient(
      transport, { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );

    await expect(client.runTask(command(), { signal: controller.signal }))
      .rejects.toThrow(/cancelled/u);
    expect(cancelCount).toBe(1);
  });

  it("removes abort subscription on a synchronous gRPC transport exception", async () => {
    const controller = new AbortController();
    const unsubscribe = jest.spyOn(controller.signal, "removeEventListener");
    const transport = {
      runAgentTask(): ClientUnaryCall {
        throw new Error("transport dial failed");
      },
    } as unknown as AgentRuntimeServiceClient;
    const client = new GrpcAgentRuntimeClient(
      transport, { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );

    await expect(client.runTask(command(), { signal: controller.signal }))
      .rejects.toThrow("transport dial failed");
    expect(unsubscribe).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not cancel a completed synchronous unary response after a later abort", async () => {
    const controller = new AbortController();
    let cancelCount = 0;
    const transport = {
      runAgentTask(_request: unknown, _metadata: unknown, _options: unknown,
        callback: (error: ServiceError | null, result: AgentRuntimeTaskResponse) => void): ClientUnaryCall {
        callback(null, response());
        return { cancel: () => { cancelCount += 1; } } as ClientUnaryCall;
      },
    } as unknown as AgentRuntimeServiceClient;
    const client = new GrpcAgentRuntimeClient(
      transport, { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );

    await expect(client.runTask(command(), { signal: controller.signal }))
      .resolves.toMatchObject({ durationMs: 25 });
    controller.abort();
    expect(cancelCount).toBe(0);
  });

  it("cancels the underlying unary call when the caller aborts", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const grpcClient = {
      runAgentTask(): ClientUnaryCall {
        return {
          cancel: () => {
            cancelled = true;
          },
        } as ClientUnaryCall;
      },
    } as unknown as AgentRuntimeServiceClient;
    const client = new GrpcAgentRuntimeClient(
      grpcClient,
      { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );

    const pending = client.runTask(command(), { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow(/cancelled/u);
    expect(cancelled).toBe(true);
  });
  it("ignores a late attested success after a caller has cancelled the unary task", async () => {
    const controller = new AbortController();
    let cancelCount = 0;
    let deliverLate = (_value: AgentRuntimeTaskResponse): void => {
      throw new Error("Unary callback not installed");
    };
    const grpcClient = {
      runAgentTask(_request: unknown, _metadata: unknown, _options: unknown,
        callback: (error: ServiceError | null, value: AgentRuntimeTaskResponse) => void): ClientUnaryCall {
        deliverLate = (value) => callback(null, value);
        return { cancel: () => { cancelCount += 1; } } as ClientUnaryCall;
      },
    } as unknown as AgentRuntimeServiceClient;
    const client = new GrpcAgentRuntimeClient(
      grpcClient, { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );
    const pending = client.runTask(command(), { signal: controller.signal });
    controller.abort();
    deliverLate(response());
    controller.abort();

    await expect(pending).rejects.toThrow(/cancelled/u);
    expect(cancelCount).toBe(1);
  });

  it("does not dispatch a pre-aborted request or decode a duplicate callback", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const runAgentTask = jest.fn();
    const client = new GrpcAgentRuntimeClient(
      { runAgentTask } as unknown as AgentRuntimeServiceClient,
      { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );
    await expect(client.runTask(command(), { signal: cancelled.signal }))
      .rejects.toThrow(/cancelled/u);
    expect(runAgentTask).not.toHaveBeenCalled();

    const grpcClient = {
      runAgentTask(_request: unknown, _metadata: unknown, _options: unknown,
        callback: (error: ServiceError | null, value: AgentRuntimeTaskResponse) => void): ClientUnaryCall {
        callback(null, response());
        const invalid = response();
        invalid.executionAttestation!.requestId = "forged-late-request";
        callback(null, invalid);
        return {} as ClientUnaryCall;
      },
    } as unknown as AgentRuntimeServiceClient;
    const valid = new GrpcAgentRuntimeClient(
      grpcClient, { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );
    await expect(valid.runTask(command())).resolves.toMatchObject({ durationMs: 25 });
  });

  it("does not cancel a synchronous success if abort fires before the handle is returned", async () => {
    const controller = new AbortController();
    let cancelCount = 0;
    const grpcClient = {
      runAgentTask(_request: unknown, _metadata: unknown, _options: unknown,
        callback: (error: ServiceError | null, value: AgentRuntimeTaskResponse) => void): ClientUnaryCall {
        callback(null, response());
        controller.abort();
        return { cancel: () => { cancelCount += 1; } } as ClientUnaryCall;
      },
    } as unknown as AgentRuntimeServiceClient;
    const client = new GrpcAgentRuntimeClient(
      grpcClient, { now: () => new Date("2026-07-17T00:00:00.000Z") },
      { timeoutMs: 1_000 },
    );

    await expect(client.runTask(command(), { signal: controller.signal }))
      .resolves.toMatchObject({ durationMs: 25 });
    expect(cancelCount).toBe(0);
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
    usage: {
      inputTokens: 12,
      outputTokens: 5,
      totalTokens: 17,
      estimatedCostUsd: 0,
    },
    failure: undefined,
    durationMs: 25,
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
