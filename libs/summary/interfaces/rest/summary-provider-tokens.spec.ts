import {
  resolveReaderSummaryModelProviderMode,
  resolveReaderSummaryTopicLabelerMode,
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

  it("uses agent-runtime as the default reader summary LLM mode", () => {
    expect(resolveReaderSummaryModelProviderMode({})).toBe("agent-runtime");
    expect(resolveReaderSummaryTopicLabelerMode({}, "deterministic")).toBe(
      "agent-runtime",
    );
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
    ).toThrow("require AGENT_RUNTIME_GRPC_ADDRESS");

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

  it("uses the reader summary agent-runtime provider for topic labeling in auto mode", () => {
    expect(
      resolveReaderSummaryTopicLabelerMode(
        {
          NODE_ENV: "staging",
          SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        },
        "agent-runtime",
      ),
    ).toBe("agent-runtime");

    expect(
      resolveReaderSummaryTopicLabelerMode(
        { READER_SUMMARY_TOPIC_LABELER: "auto" },
        "deterministic",
      ),
    ).toBe("deterministic");
  });

  it("allows deterministic topic labeling only when explicitly selected", () => {
    expect(
      resolveReaderSummaryTopicLabelerMode(
        { READER_SUMMARY_TOPIC_LABELER: "deterministic" },
        "agent-runtime",
      ),
    ).toBe("deterministic");
    expect(
      resolveReaderSummaryModelProviderMode({
        READER_SUMMARY_MODEL_PROVIDER: "deterministic",
      }),
    ).toBe("deterministic");
  });

  it("keeps beta reader summary defaults durable", () => {
    expect(
      resolveReaderSummaryModelProviderMode({
        NODE_ENV: "staging",
        SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
      }),
    ).toBe("agent-runtime");
    expect(
      resolveReaderSummaryTopicLabelerMode(
        {
          NODE_ENV: "staging",
          SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        },
        "agent-runtime",
      ),
    ).toBe("agent-runtime");
    expect(() =>
      resolveReaderSummaryModelProviderMode({
        NODE_ENV: "staging",
        SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        READER_SUMMARY_MODEL_PROVIDER: "deterministic",
      }),
    ).toThrow("READER_SUMMARY_MODEL_PROVIDER=deterministic is not allowed");
    expect(() =>
      resolveReaderSummaryModelProviderMode({
        NODE_ENV: "staging",
        SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        READER_SUMMARY_MODEL_PROVIDER: "openai-responses",
      }),
    ).toThrow("READER_SUMMARY_MODEL_PROVIDER=openai-responses is not allowed");
    expect(() =>
      resolveReaderSummaryTopicLabelerMode(
        {
          NODE_ENV: "staging",
          SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
          READER_SUMMARY_TOPIC_LABELER: "deterministic",
        },
        "agent-runtime",
      ),
    ).toThrow("READER_SUMMARY_TOPIC_LABELER=deterministic is not allowed");
  });

  it("uses agent-runtime topic labeling in auto mode when runtime is configured", () => {
    expect(
      resolveReaderSummaryTopicLabelerMode(
        {
          AGENT_RUNTIME_GRPC_ADDRESS: "agent-runtime:50052",
        },
        "deterministic",
      ),
    ).toBe("agent-runtime");
  });
});
