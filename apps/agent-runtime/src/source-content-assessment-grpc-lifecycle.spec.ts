import { Metadata } from "@grpc/grpc-js";
import { AgentRuntimeProvider } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { createAgentRuntimeGrpcService } from "./agent-runtime-grpc-service";
import type { AgentRuntimeExecutionResult } from "./agent-runtime-executor.port";
import { assessmentRequest } from "./source-content-assessment-lease.spec-support";

it("caller cancellation keeps only its outstanding ownership until executor settlement", async () => {
  const settle = new Map<string, (result: AgentRuntimeExecutionResult) => void>();
  const execute = jest.fn((request) => new Promise<AgentRuntimeExecutionResult>((resolve) => {
    settle.set(request.requestId, resolve);
  }));
  const service = createAgentRuntimeGrpcService({ execute, checkHealth: jest.fn() }, {});
  const call = (id: string, cancelled = false) => ({
    cancelled, metadata: new Metadata(), request: {
      ...assessmentRequest(id), schemaVersion: 1,
      provider: AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX,
      providerInstanceId: "", cwd: "",
    },
  });
  const invoke = (input: ReturnType<typeof call>, callback = jest.fn()) => {
    service.runAgentTask(input as Parameters<typeof service.runAgentTask>[0], callback);
    return callback;
  };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const completed: AgentRuntimeExecutionResult = { status: "completed", warnings: [] };
  invoke(call("pre-cancelled", true));
  expect(execute).not.toHaveBeenCalled();
  const first = call("first");
  const firstCallback = invoke(first);
  first.cancelled = true;
  const otherCallback = invoke(call("other"));
  expect(execute).toHaveBeenCalledTimes(2);
  const duplicate = invoke(call("first"));
  await flush();
  expect(duplicate).toHaveBeenCalledWith(null, expect.objectContaining({
    failure: expect.objectContaining({ code: "assessment_execution_leased" }),
  }));
  settle.get("other")!(completed);
  await flush();
  expect(otherCallback).toHaveBeenCalledTimes(1);
  expect(firstCallback).not.toHaveBeenCalled();
  settle.get("first")!(completed);
  await flush();
  expect(firstCallback).not.toHaveBeenCalled();
  const resumed = invoke(call("first"));
  expect(execute).toHaveBeenCalledTimes(3);
  settle.get("first")!(completed);
  await flush();
  expect(resumed).toHaveBeenCalledTimes(1);
});
