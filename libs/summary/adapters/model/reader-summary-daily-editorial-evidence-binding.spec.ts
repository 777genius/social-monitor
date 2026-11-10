import type { ReaderSummaryDailyGenerationInput } from "../../domain";
import { buildDailyEditorialPromptFromEvidence } from "./reader-summary-daily-editorial-model";
import { buildDailyEditorialPromptFromEvidence as bindFrozenEvidence } from "./reader-summary-daily-editorial-evidence-binding";

const frozen = {
  manifestSha256: "a".repeat(64),
  periodKey: "daily:2026-11-08",
  cutoffAt: "2026-11-09T00:00:00.000Z",
  selected: [
    { feedItemId: "feed-one", storyId: "story-one", providerKey: "reddit",
      publishedAt: "2026-11-08T01:00:00Z", nativeCount: 17, engagementObservedAt: null },
    { feedItemId: "feed-two", storyId: "story-two", providerKey: "github",
      publishedAt: "2026-11-08T02:00:00Z", nativeCount: null,
      engagementObservedAt: "2026-11-08T03:00:00Z" },
  ],
} as unknown as ReaderSummaryDailyGenerationInput;

describe("frozen daily editorial evidence binding", () => {
  it("preserves the legacy entrypoint and exact request serialization", () => {
    expect(buildDailyEditorialPromptFromEvidence).toBe(bindFrozenEvidence);
    const evidence = [
      { feedItemId: "feed-one", headline: "First item", providerKey: "forged",
        storyId: "forged", nativeCount: 999 },
      { feedItemId: "feed-two", headline: "Second item", publishedAt: "forged" },
    ];
    expect(bindFrozenEvidence(frozen, evidence)).toBe(JSON.stringify({
      version: "reader_summary.daily_editorial.request.v1",
      frozenInputSha256: frozen.manifestSha256,
      periodKey: frozen.periodKey,
      sourceWindowCutoff: frozen.cutoffAt,
      sources: [
        { ...evidence[0], storyId: "story-one", publishedAt: "2026-11-08T01:00:00Z",
          providerKey: "reddit", nativeCount: 17, engagementObservedAt: null },
        { ...evidence[1], storyId: "story-two", publishedAt: "2026-11-08T02:00:00Z",
          providerKey: "github", nativeCount: null,
          engagementObservedAt: "2026-11-08T03:00:00Z" },
      ],
    }));
  });

  it("rejects changed evidence count before serialization", () => {
    expect(() => bindFrozenEvidence(frozen, [{ feedItemId: "feed-one" }]))
      .toThrow("Daily editorial evidence length differs from frozen input");
  });

  it("rejects reordered or injected evidence rather than rebinding its identity", () => {
    expect(() => bindFrozenEvidence(frozen, [
      { feedItemId: "feed-two" }, { feedItemId: "feed-one" },
    ])).toThrow("Daily editorial evidence order differs from frozen input");
    expect(() => bindFrozenEvidence(frozen, [
      { feedItemId: "fabricated" }, { feedItemId: "feed-two" },
    ])).toThrow("Daily editorial evidence order differs from frozen input");
  });
});
