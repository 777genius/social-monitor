import type { SummaryEvidenceItem } from "../../domain";
import {
  adaptiveSourceContent,
  compactText,
  normalizeSourceText,
} from "./openai-responses-reader-summary-source-content";
import {
  compactText as directCompactText,
  relevantSourceFragments,
} from "./openai-responses-reader-summary-source-fragments";

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
  it("keeps the historical text compaction function identical to its direct policy export", () => {
    expect(compactText).toBe(directCompactText);
  });

  it("selects bounded relevant source fragments deterministically from RSS text", () => {
    const source = `${"General market background. ".repeat(180)}Ultra preview capability has a tighter usage limit. ${"Additional general background. ".repeat(45)}`;
    const item = {
      providerKey: "rss",
      sourceText: source,
      title: "Ultra preview usage limit",
      whyImportant: ["Ultra preview capability"],
    } as SummaryEvidenceItem;
    const content = adaptiveSourceContent(item, source.length) as {
      readonly mode: string;
      readonly originalCharacterCount: number;
      readonly includedCharacterCount: number;
      readonly fragments: readonly string[];
    };
    expect(content.mode).toBe("rss_relevant_fragments");
    expect(content.originalCharacterCount).toBe(source.trim().length);
    expect(content.fragments).toEqual(relevantSourceFragments(source.trim(), item));
    expect(content.fragments).toHaveLength(3);
    expect(content.fragments.some(fragment => fragment.includes("Ultra preview capability"))).toBe(true);
    expect(content.includedCharacterCount).toBe(content.fragments.reduce((total, fragment) => total + fragment.length, 0));
  });
});
