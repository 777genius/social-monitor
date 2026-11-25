import { isReaderSummaryPreviewCoveredByHydratedSource as covered } from "./openai-responses-reader-summary-preview-coverage";

describe("reader summary transmitted-preview deduplication", () => {
  it("requires exact containment in transmitted whole text, including UTF-16", () => {
    const preview = "Ultra 🧪界 qualifier";
    const full = { text: `Prefix ${preview} suffix`, mode: "full_source_text" };
    const snapshot = JSON.stringify(full);

    expect(covered(preview, full)).toBe(true);
    expect(covered(preview.toLowerCase(), full)).toBe(false);
    expect(covered("Ultra 🧪界 qualifier extra", full)).toBe(false);
    expect(covered(preview, undefined)).toBe(false);
    expect(covered(undefined, full)).toBe(false);
    expect(covered("", full)).toBe(false);
    expect(JSON.stringify(full)).toBe(snapshot);
  });

  it("requires containment wholly inside one transmitted fragment", () => {
    const preview = "🧪界 model-specific caveat";
    const fragments = { mode: "rss_relevant_fragments",
      fragments: ["before 🧪界 model-", "specific caveat after"] };
    expect(covered(preview, fragments)).toBe(false);
    expect(covered(preview, { ...fragments, fragments: [`before ${preview} after`] })).toBe(true);
    expect(covered(preview, { ...fragments, fragments: [null, 12, "unrelated"] })).toBe(false);
    // Never claim a non-transmitted preview is covered by discarded raw source.
    expect(covered(preview, { mode: "rss_relevant_fragments", fragments: ["partial"] })).toBe(false);
  });

  it("does not consult fragments when a transmitted text field exists", () => {
    const preview = "accepted preview";
    const content = { text: "short", fragments: [`full ${preview}`] };
    expect(covered(preview, content)).toBe(false);
    expect(covered(preview, { text: `full ${preview}`, fragments: [] })).toBe(true);
  });
});
