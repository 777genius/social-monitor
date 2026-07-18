import {
  readerSummaryPublicationGenerationRequestedAt,
  readerSummaryPublicationGenerationSignals,
} from "./prisma-reader-summary-publication-generation";

describe("reader summary publication generation metadata", () => {
  it("round-trips the generation request timestamp", () => {
    const requestedAt = new Date("2026-07-09T08:15:00.000Z");
    const signals = readerSummaryPublicationGenerationSignals(requestedAt);

    expect(readerSummaryPublicationGenerationRequestedAt(signals)).toEqual(
      requestedAt,
    );
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { publicationGeneration: null },
    { publicationGeneration: { requestedAt: "not-a-date" } },
  ])("ignores malformed metadata %#", (signals) => {
    expect(
      readerSummaryPublicationGenerationRequestedAt(signals),
    ).toBeUndefined();
  });
});
