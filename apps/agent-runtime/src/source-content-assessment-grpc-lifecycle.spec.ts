import { Metadata } from "@grpc/grpc-js";
import { AgentRuntimeProvider } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { createAgentRuntimeGrpcService } from "./agent-runtime-grpc-service";
import type { AgentRuntimeExecutionResult } from "./agent-runtime-executor.port";
import { assessmentRequest } from "./source-content-assessment-runtime.spec-support";

it.each(["success", "error"])("cancellation suppresses late %s while independent work completes", async (outcome) => {
  let fail!: (error: Error) => void;
  const settle = new Map<string, (result: AgentRuntimeExecutionResult) => void>();
  const execute = jest.fn((request) => new Promise<AgentRuntimeExecutionResult>((resolve, reject) => {
    if (request.requestId === "first") fail = reject;
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
  settle.get("other")!(completed);
  await flush();
  expect(otherCallback).toHaveBeenCalledTimes(1);
  expect(firstCallback).not.toHaveBeenCalled();
  if (outcome === "success") settle.get("first")!(completed);
  else fail(new Error("Synthetic late execution error"));
  await flush();
  expect(firstCallback).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledTimes(2);
});
