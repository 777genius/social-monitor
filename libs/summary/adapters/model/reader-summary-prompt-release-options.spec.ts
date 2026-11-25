import type { AgentRuntimeClientPort } from "../../ports";
import { resolveAgentRuntimeReaderSummaryModelOptions } from "./agent-runtime-reader-summary-model.adapter";
import { resolveOpenAiResponsesReaderSummaryModelOptions } from "./openai-responses-reader-summary-model.adapter";

describe("reader summary prompt release options", () => {
  it("rejects an agent-runtime prompt release override", () => {
    expect(() =>
      resolveAgentRuntimeReaderSummaryModelOptions(
        {
          AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION:
            "reader_summary.prompt.stale",
        },
        {} as AgentRuntimeClientPort,
      ),
    ).toThrow(
      "AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION is no longer supported",
    );
  });

  it("rejects an OpenAI prompt release override", () => {
    expect(() =>
      resolveOpenAiResponsesReaderSummaryModelOptions(
        {
          OPENAI_READER_SUMMARY_PROMPT_VERSION: "reader_summary.prompt.stale",
        },
        { requireApiKey: false },
      ),
    ).toThrow("OPENAI_READER_SUMMARY_PROMPT_VERSION is no longer supported");
  });
});
