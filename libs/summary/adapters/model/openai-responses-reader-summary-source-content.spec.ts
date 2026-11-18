import type { SummaryEvidenceItem } from "../../domain";
import {
  adaptiveSourceContent,
  compactText,
  normalizeSourceText,
} from "./openai-responses-reader-summary-source-content";
import { normalizeSourceText as directNormalizeSourceText } from "./openai-responses-reader-summary-source-normalization";
import {
  compactText as directCompactText,
  relevantSourceFragments,
} from "./openai-responses-reader-summary-source-fragments";
import {
  sourceChunks,
  compactText as chunkCompactText,
} from "./openai-responses-reader-summary-fragment-chunking";
import {
  relevantSourceFragments as directlyRankedFragments,
} from "./openai-responses-reader-summary-fragment-ranking";

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

  it("uses one independent lexical admission policy for expansion and hydration", () => {
    expect(normalizeSourceText).toBe(directNormalizeSourceText);
    const raw = "  [🧪 v2](https://example.invalid/source)   <b>value</b>  ";
    expect(directNormalizeSourceText(raw, raw.length)).toBe("🧪 v2 value");
    expect(directNormalizeSourceText("https://example.invalid/only", 100)).toBeUndefined();
    // UTF-16 limits are preserved (astral symbol uses two code units).
    expect(directNormalizeSourceText("🧪qualifier tail", 2)).toBe("🧪");
    expect(raw).toContain("[🧪 v2]");
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
  it("preserves source-fragment function identity across the legacy and specialized imports", () => {
    expect(relevantSourceFragments).toBe(directlyRankedFragments);
    expect(compactText).toBe(chunkCompactText);
  });

  it("segments a long, non-whitespace source without dropping or duplicating text", () => {
    const source = "a".repeat(781);
    expect(sourceChunks(source)).toEqual(["a".repeat(780), "a"]);
    expect(sourceChunks(source).join("")).toBe(source);
    expect(sourceChunks("")).toEqual([""]);
  });

  it("keeps lexical ranking deterministic and avoids mutating frozen evidence", () => {
    const source = [
      "General commentary and unrelated context. ".repeat(30),
      "Ultra preview token limits have changed. ".repeat(30),
      "Ordinary unrelated market context. ".repeat(30),
    ].join("");
    const item = Object.freeze(evidenceItem({
      providerKey: "rss",
      sourceText: source,
      title: "Ultra preview limits",
      whyImportant: Object.freeze(["token limits"]),
    }));
    const ranked = relevantSourceFragments(source, item);
    expect(ranked).toEqual(directlyRankedFragments(source, item));
    expect(ranked).toHaveLength(3);
    expect(ranked.some((fragment) => fragment.includes("Ultra preview token limits"))).toBe(true);
    expect(item.whyImportant).toEqual(["token limits"]);
    expect(ranked).toEqual(relevantSourceFragments(source, item));
  });

});
