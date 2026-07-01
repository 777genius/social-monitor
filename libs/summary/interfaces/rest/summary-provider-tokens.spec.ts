import {
  resolveReaderSummaryModelProviderMode,
  resolveSummaryModelProviderMode,
} from "./summary-provider-tokens";
import { resolveSummaryAgentRuntimeClientOptions } from "./summary-agent-runtime-provider-tokens";

describe("summary provider tokens", () => {
  it("accepts agent-runtime as a durable summary provider mode", () => {
    expect(
      resolveSummaryModelProviderMode({
        NODE_ENV: "staging",
        SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        SUMMARY_MODEL_PROVIDER: "agent-runtime",
      }),
    ).toBe("agent-runtime");
    expect(
      resolveReaderSummaryModelProviderMode({
        NODE_ENV: "staging",
        SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        READER_SUMMARY_MODEL_PROVIDER: "agent-runtime",
      }),
    ).toBe("agent-runtime");
  });

  it("requires a gRPC address when agent-runtime mode is selected", () => {
    expect(() =>
      resolveSummaryAgentRuntimeClientOptions(
        {
          NODE_ENV: "staging",
          SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        },
        { requireAddress: true },
      ),
    ).toThrow("requires AGENT_RUNTIME_GRPC_ADDRESS");

    expect(
      resolveSummaryAgentRuntimeClientOptions(
        {
          AGENT_RUNTIME_GRPC_ADDRESS: "agent-runtime:50052",
          AGENT_RUNTIME_GRPC_TIMEOUT_MS: "7000",
        },
        { requireAddress: true },
      ),
    ).toMatchObject({
      address: "agent-runtime:50052",
      timeoutMs: 7000,
    });
  });
});
