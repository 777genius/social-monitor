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

const evidenceItem = (
  values: Pick<SummaryEvidenceItem, "providerKey" | "sourceText" | "title" | "whyImportant">,
): SummaryEvidenceItem => ({
  feedItemId: "source-content-test-feed",
  sourceItemId: "source-content-test-source",
  sourceBindingId: "source-content-test-binding",
  interestId: "source-content-test-interest",
  canonicalUrl: "https://example.invalid/source",
  publishedAt: new Date("2026-07-09T00:00:00.000Z"),
  observedAt: new Date("2026-07-09T00:01:00.000Z"),
  score: 1,
  ...values,
});

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
    const item = evidenceItem({
      providerKey: "rss",
      sourceText: source,
      title: "Ultra preview usage limit",
      whyImportant: ["Ultra preview capability"],
    });
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

  it("keeps short social posts whole after the existing source privacy normalization", () => {
    const item = evidenceItem({
      providerKey: "reddit",
      sourceText: "An   original <b>post</b> with https://example.invalid/private",
      title: "Source trust",
      whyImportant: [],
    });
    const text = "An original post with";
    expect(adaptiveSourceContent(item, 10_000)).toEqual({
      mode: "full_social_post",
      originalCharacterCount: text.length,
      includedCharacterCount: text.length,
      text,
    });
  });

  it("routes oversized social content through bounded deterministic fragments", () => {
    const source = "Long social discussion context. ".repeat(150);
    const item = evidenceItem({
      providerKey: "x-twitter",
      sourceText: source,
      title: "Social discussion",
      whyImportant: ["context"],
    });
    const content = adaptiveSourceContent(item, 10_000) as {
      readonly mode: string;
      readonly originalCharacterCount: number;
      readonly includedCharacterCount: number;
      readonly fragments: readonly string[];
    };
    expect(content.mode).toBe("relevant_fragments");
    expect(content.originalCharacterCount).toBe(source.trim().length);
    expect(content.fragments.length).toBeGreaterThan(0);
    expect(content.fragments.length).toBeLessThanOrEqual(3);
    expect(content.includedCharacterCount).toBe(
      content.fragments.reduce((sum, fragment) => sum + fragment.length, 0),
    );
    expect(content.includedCharacterCount).toBeLessThan(content.originalCharacterCount);
  });
});
