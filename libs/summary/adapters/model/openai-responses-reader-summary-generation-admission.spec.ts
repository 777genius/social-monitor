import type { ReaderSummaryModelInput } from "../../ports";
import { admitOpenAiReaderSummaryGeneration } from "./openai-responses-reader-summary-generation-admission";
import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-provider-error";

// The gate uses only the frozen backend-selected evidence projection. No paid
// request, raw provider payload or real credentials are needed in these tests.
const inputWithProviders = (providerKeys: readonly string[]): ReaderSummaryModelInput => {
  const selectedEvidence = providerKeys.map((providerKey, index) => ({
    feedItemId: `synthetic-feed-${index}`,
    providerKey,
  }));
  return {
    evidence: {
      selectedEvidence,
      clusters: [],
      sourceWindow: {
        selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
        storyClusterIds: [],
      },
    },
  } as unknown as ReaderSummaryModelInput;
};

describe("OpenAI reader summary paid-generation admission", () => {
  it("preserves no-signal-before-credential precedence", () => {
    const input = inputWithProviders([]);
    const before = JSON.stringify(input);
    expect(admitOpenAiReaderSummaryGeneration(input, "")).toBe("no_signal");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("rejects an uncredentialed selected evidence run with the legacy failure", () => {
    const input = inputWithProviders(["reddit"]);
    let caught: unknown;
    try {
      admitOpenAiReaderSummaryGeneration(input, "");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReaderSummaryModelProviderError);
    expect((caught as ReaderSummaryModelProviderError).failure).toEqual({
      kind: "provider_unavailable",
      retryable: false,
      message: "READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY",
    });
  });

  it("admits selected evidence with a key without mutating input", () => {
    const input = inputWithProviders(["reddit", "hacker-news"]);
    const before = JSON.stringify(input);
    expect(admitOpenAiReaderSummaryGeneration(input, "synthetic-non-secret")).toBe("dispatch");
    expect(JSON.stringify(input)).toBe(before);
  });
});
