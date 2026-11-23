import fs from "node:fs";
import type { AgentRuntimeClientPort } from "../../ports";
import { GatewayLlmClient } from "../../adapters/model/gateway-llm/gateway-llm-client";
import { GrpcAgentRuntimeClient } from "../../adapters/model/grpc-agent-runtime-client";
import { createSourceAssessmentRuntime } from "./source-assessment-runtime-provider-tokens";

const clock = { now: () => new Date("2026-10-30T00:00:00.000Z") };
const gatewayEnv: NodeJS.ProcessEnv = {
  AGENT_RUNTIME_TRANSPORT: "gateway-llm", AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
  AGENT_RUNTIME_GATEWAY_LLM_CONTROL_ORIGIN: "https://gateway.example.test",
  AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE: "/fixture/control-token",
  AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: "synthetic-account",
  AGENT_RUNTIME_GATEWAY_LLM_POLICY_SUBJECT_REF: "synthetic-social-monitor",
  AGENT_RUNTIME_GATEWAY_LLM_POLICY_REVISION: "1", AGENT_RUNTIME_GATEWAY_LLM_BINDING_REVISION: "0",
};

describe("source assessment selected transport", () => {
  afterEach(() => jest.restoreAllMocks());

  it("selects the shared gateway client without requiring or connecting gRPC", () => {
    const read = jest.spyOn(fs, "readFileSync").mockReturnValue("synthetic-control-token");
    const connect = jest.spyOn(GrpcAgentRuntimeClient, "connect");
    const runtime = createSourceAssessmentRuntime({ env: gatewayEnv, clock });
    expect(runtime.client).toBeInstanceOf(GatewayLlmClient);
    expect(runtime).toMatchObject({ model: "gpt-6.1-terra", modelBackend: "openai-chatgpt", reasoningEffort: "medium",
      totalTimeoutMs: 600_000, batchTimeoutMs: 300_000 });
    expect(read).toHaveBeenCalledWith("/fixture/control-token", "utf8");
    expect(connect).not.toHaveBeenCalled();
  });

  it("reuses a supplied capture client and resolves identity without opening a transport", () => {
    const client: AgentRuntimeClientPort = { runTask: jest.fn(), checkHealth: jest.fn() };
    const read = jest.spyOn(fs, "readFileSync");
    const connect = jest.spyOn(GrpcAgentRuntimeClient, "connect");
    const runtime = createSourceAssessmentRuntime({ env: {
      AGENT_RUNTIME_TRANSPORT: "gateway-llm", AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
    }, clock, client });
    expect(runtime.client).toBe(client);
    expect(runtime).toMatchObject({ model: "k3-256k", modelBackend: "kimi-code", reasoningEffort: "default" });
    expect(read).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("keeps explicit legacy rollback on gRPC and its existing assessment controls", () => {
    const client = {} as GrpcAgentRuntimeClient;
    const connect = jest.spyOn(GrpcAgentRuntimeClient, "connect").mockReturnValue(client);
    const runtime = createSourceAssessmentRuntime({ env: { AGENT_RUNTIME_TRANSPORT: "agent-runtime",
      AGENT_RUNTIME_GRPC_ADDRESS: "runtime.example.test:50052", AGENT_RUNTIME_TASK_CWD: "/srv/test-project" }, clock });
    expect(runtime.client).toBe(client);
    expect(runtime).not.toHaveProperty("model");
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ address: "runtime.example.test:50052",
      options: expect.objectContaining({ defaultCwd: "/srv/test-project" }) }));
  });
});
