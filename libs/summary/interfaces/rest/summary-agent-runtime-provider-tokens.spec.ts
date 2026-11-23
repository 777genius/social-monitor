import { Test } from "@nestjs/testing";
import type { FactoryProvider } from "@nestjs/common";
import type { AgentRuntimeClientPort } from "../../ports";
import {
  SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS, SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT,
  summaryAgentRuntimeSummaryModelOptionsProvider, summaryAgentRuntimeClientOptionsProvider,
} from "./summary-agent-runtime-provider-tokens";
import type { AgentRuntimeSummaryModelAdapterOptions } from "../../adapters/model/agent-runtime-summary-model.adapter";

describe("ordinary summary selected transport wiring", () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { NODE_ENV: "test", AGENT_RUNTIME_TRANSPORT: "gateway-llm",
    AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt" }; });
  afterEach(() => { process.env = originalEnv; });

  it("injects the selected shared client without a direct gRPC dependency", async () => {
    const client: AgentRuntimeClientPort = { runTask: jest.fn(), checkHealth: jest.fn() };
    const module = await Test.createTestingModule({ providers: [
      { provide: SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT, useValue: client },
      summaryAgentRuntimeSummaryModelOptionsProvider,
    ] }).compile();
    try {
      const options = module.get<AgentRuntimeSummaryModelAdapterOptions>(SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS);
      expect(options.client).toBe(client);
      expect(options).toMatchObject({ model: "gpt-6.1-terra", modelBackend: "openai-chatgpt", reasoningEffort: "medium" });
    } finally { await module.close(); }
  });

  it("requires the legacy address only when the selected transport uses it", () => {
    const provider = summaryAgentRuntimeClientOptionsProvider as FactoryProvider;
    expect(provider.useFactory("agent-runtime", "agent-runtime", "agent-runtime"))
      .toMatchObject({ address: "127.0.0.1:0" });
    process.env.AGENT_RUNTIME_TRANSPORT = "agent-runtime";
    expect(() => provider.useFactory("agent-runtime", "agent-runtime", "agent-runtime"))
      .toThrow("require AGENT_RUNTIME_GRPC_ADDRESS");
  });
});
