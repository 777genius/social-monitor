import { enrichReaderSummaryTopicLabelVersion } from "./reader-summary-topic-label-version-enrichment";

describe("enrichReaderSummaryTopicLabelVersion", () => {
  it("restores a dominant major model family from grounded candidates", () => {
    expect(
      enrichReaderSummaryTopicLabelVersion({
        label: "GPT Models Comparison",
        candidateLabels: [
          "GPT-5.4 Sol",
          "GPT-5.5 Terra",
          "GPT-5.6 Luna",
          "GPT-4.5 Legacy",
        ],
      }),
    ).toBe("GPT-5 Models Comparison");
  });

  it("preserves the candidate separator style", () => {
    expect(
      enrichReaderSummaryTopicLabelVersion({
        label: "Fable Availability",
        candidateLabels: ["Fable 5 access", "Fable 5 subscription"],
      }),
    ).toBe("Fable 5 Availability");
  });

  it("does not guess when major versions have equal support", () => {
    expect(
      enrichReaderSummaryTopicLabelVersion({
        label: "Grok Models Comparison",
        candidateLabels: ["Grok 4 benchmark", "Grok 5 benchmark"],
      }),
    ).toBe("Grok Models Comparison");
  });

  it("does not alter labels that already include a version", () => {
    expect(
      enrichReaderSummaryTopicLabelVersion({
        label: "GPT-5 Models Comparison",
        candidateLabels: ["GPT-5.6 Sol", "GPT-4.5 Legacy"],
      }),
    ).toBe("GPT-5 Models Comparison");
  });
});
