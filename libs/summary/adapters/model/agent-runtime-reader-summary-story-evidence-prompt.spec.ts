import {
  boundedRelevantSourceExcerpt,
  evidenceSample,
  normalizedAuthor,
  requiredEvidence,
} from "./agent-runtime-reader-summary-story-evidence-prompt";

describe("Reader-summary story verifier evidence presentation", () => {
  it("keeps the initial 2048 UTF-16 code units and a later relevant excerpt", () => {
    const source = "a".repeat(2_048) + "b".repeat(3_000) + "release-name" + "c".repeat(3_000);
    const bounded = boundedRelevantSourceExcerpt(source, ["release-name"]);
    expect(bounded?.length).toBe(4_096);
    expect(bounded?.startsWith("a".repeat(2_048))).toBe(true);
    expect(bounded).toContain("release-name");
  });

  it("falls back to tail text and retains short source verbatim", () => {
    expect(boundedRelevantSourceExcerpt("short source", ["missing"])).toBe("short source");
    const source = "a".repeat(2_048) + "b".repeat(4_000);
    const bounded = boundedRelevantSourceExcerpt(source, []);
    expect(bounded).toBe("a".repeat(2_048) + "b".repeat(2_048));
  });

  it("preserves feed scope and author normalization without allowing unknown keys", () => {
    expect(normalizedAuthor("  AUTHOR-ONE  ")).toBe("author-one");
    expect(normalizedAuthor("   ")).toBeUndefined();
    expect(() => requiredEvidence(new Map(), "missing")).toThrow("Unknown story relation evidence missing");
    expect(evidenceSample({
      providerKey: "reddit",
      title: "Synthetic story",
      bodyPreview: "x".repeat(700),
      sourceText: "Synthetic source",
      authorHandle: "  AUTHOR-ONE  ",
      canonicalUrl: "https://example.test/story",
      publishedAt: new Date("2026-06-01T00:00:00.000Z"),
    }).bodyPreview).toBe("x".repeat(640));
  });
});
