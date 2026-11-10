import {
  compactText,
  normalizeSourceText,
} from "./openai-responses-reader-summary-source-content";

describe("reader-summary source-content privacy and bounds", () => {
  it("keeps the existing lexical URL, markup and Markdown link normalization", () => {
    const text = "[label](https://example.invalid/a) Next <b>detail</b> https://example.invalid/other";
    expect(normalizeSourceText(text, 500)).toBe("label Next detail");
    expect(normalizeSourceText(undefined, 500)).toBeUndefined();
  });

  it("retains bounded text compaction without reordering words", () => {
    expect(compactText("  A   B  ", 20)).toBe("A B");
    expect(compactText("abcdefghijklmnop", 10)).toBe("abcdefg...");
  });
});
