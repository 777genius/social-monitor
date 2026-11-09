import type { AgentRuntimeClientPort } from "../../ports";
import { resolveAgentRuntimeReaderSummaryModelOptions as oldResolver } from "./agent-runtime-reader-summary-model.adapter";
import { resolveAgentRuntimeReaderSummaryModelOptions } from "./agent-runtime-reader-summary-options";

const client = {} as AgentRuntimeClientPort;

describe("agent runtime reader summary environment options", () => {
  it("keeps the public resolver identity and timeout precedence", () => {
    expect(oldResolver).toBe(resolveAgentRuntimeReaderSummaryModelOptions);
    const options = oldResolver({
      AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS: "12345",
      AGENT_RUNTIME_TIMEOUT_MS: "54321",
      AGENT_RUNTIME_READER_SUMMARY_MAX_OUTPUT_TOKENS: "2000",
      READER_SUMMARY_EVAL_DATASET_VERSION: "test-dataset",
      AGENT_RUNTIME_PROVIDER_INSTANCE_ID: "gateway-test",
    }, client);
    expect(options).toMatchObject({
      client, providerInstanceId: "gateway-test", evalDatasetVersion: "test-dataset",
      timeoutMs: 12345, maxOutputTokens: 2000,
    });
    expect(oldResolver({ AGENT_RUNTIME_TIMEOUT_MS: "54321" }, client).timeoutMs).toBe(54321);
  });

  it("keeps invalid numeric options absent and fails closed on prompt override", () => {
    const options = oldResolver({
      AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS: "0",
      AGENT_RUNTIME_READER_SUMMARY_MAX_OUTPUT_TOKENS: "NaN",
    }, client);
    expect(options.timeoutMs).toBeUndefined();
    expect(options.maxOutputTokens).toBeUndefined();
    expect(() => oldResolver({
      AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION: "override-not-allowed",
    }, client)).toThrow();
  });
});
