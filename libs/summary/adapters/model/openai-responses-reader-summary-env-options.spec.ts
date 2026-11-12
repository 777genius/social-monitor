import {
  resolveOpenAiResponsesReaderSummaryModelOptions as legacyEntrypoint,
} from "./openai-responses-reader-summary-model.adapter";
import { resolveOpenAiResponsesReaderSummaryModelOptions } from "./openai-responses-reader-summary-options";
import { projectOpenAiReaderSummaryEnvironment } from "./openai-responses-reader-summary-env-options";

describe("OpenAI Reader Summary environment, credential and prompt boundaries", () => {
  const optional = { requireApiKey: false } as const;

  it("preserves the old adapter entrypoint and credential-first field ordering", () => {
    expect(legacyEntrypoint).toBe(resolveOpenAiResponsesReaderSummaryModelOptions);
    expect(Object.keys(resolveOpenAiResponsesReaderSummaryModelOptions({}, optional))[0])
      .toBe("apiKey");
  });

  it("projects nonsecret settings without reading a missing credential file", () => {
    const env = {
      OPENAI_API_KEY_FILE: "/__sm_nonexistent_key_fixture__",
      OPENAI_RESPONSES_ENDPOINT_URL: "https://example.test/v1/responses",
      OPENAI_READER_SUMMARY_MODEL: "reader-model",
      OPENAI_SUMMARY_MODEL: "fallback-model",
      READER_SUMMARY_EVAL_DATASET_VERSION: "fixture-dataset",
      OPENAI_READER_SUMMARY_TIMEOUT_MS: "600",
      OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "1024",
      OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS: "0",
      OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS: "0.125",
    };
    expect(projectOpenAiReaderSummaryEnvironment(env)).toEqual({
      endpointUrl: "https://example.test/v1/responses",
      model: "reader-model",
      evalDatasetVersion: "fixture-dataset",
      timeoutMs: 600,
      maxOutputTokens: 1024,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0.125,
    });
    expect(() => resolveOpenAiResponsesReaderSummaryModelOptions(env, optional))
      .toThrow("OPENAI_API_KEY_FILE does not exist");
  });

  it("retains model fallback and strict numeric rejection without changing defaults", () => {
    expect(projectOpenAiReaderSummaryEnvironment({
      OPENAI_SUMMARY_MODEL: "fallback-model",
      OPENAI_READER_SUMMARY_TIMEOUT_MS: "0",
      OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "3.2",
      OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS: "-1",
      OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS: "Infinity",
    })).toMatchObject({
      model: "fallback-model",
      timeoutMs: undefined,
      maxOutputTokens: undefined,
      estimatedInputCostUsdPerMillionTokens: undefined,
      estimatedOutputCostUsdPerMillionTokens: undefined,
    });
  });

  it("validates immutable prompt before credential I/O and preserves missing-key rejection", () => {
    expect(() => resolveOpenAiResponsesReaderSummaryModelOptions({
      OPENAI_READER_SUMMARY_PROMPT_VERSION: "stale-release",
      OPENAI_API_KEY_FILE: "/__sm_nonexistent_key_fixture__",
    }, optional)).toThrow(
      "OPENAI_READER_SUMMARY_PROMPT_VERSION is no longer supported",
    );
    expect(() => resolveOpenAiResponsesReaderSummaryModelOptions({}, {
      requireApiKey: true,
    })).toThrow(
      "READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY or OPENAI_API_KEY_FILE",
    );
    expect(resolveOpenAiResponsesReaderSummaryModelOptions({
      OPENAI_API_KEY: "  synthetic-value  ",
    }, { requireApiKey: true }).apiKey).toBe("synthetic-value");
  });
});
