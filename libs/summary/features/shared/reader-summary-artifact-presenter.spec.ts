import {
  presentReaderSummaryArtifact,
  publicReaderSummaryMatchedRules,
} from "./reader-summary-artifact-presenter";
import { artifact } from
  "../../domain/policies/reader-summary-publication-policy-test-fixtures";

describe("reader summary artifact presentation", () => {
  it("preserves reason provenance internally without adding it to the public story contract", () => {
    const original = artifact();
    const topStories = original.toSnapshot().topStories.map((story) => ({
      ...story,
      readerReasonProvenance: {
        kind: "model" as const,
        originalStoryClusterId: story.storyClusterId,
        originalCitationIds: [...story.citationIds],
        originalSummary: story.summary,
      },
    }));
    const withProvenance = artifact({ topStories });
    const freshness = { status: "fresh" as const, checkedAt: new Date("2026-07-06T00:00:00Z") };
    expect(presentReaderSummaryArtifact(withProvenance, freshness))
      .toEqual(presentReaderSummaryArtifact(original, freshness));
    expect(withProvenance.toSnapshot().topStories).toEqual(topStories);
  });

  it("does not expose the private editorial proof in GET/List presentation", () => {
    const original = artifact();
    const snapshot = original.toSnapshot();
    const fixture = { toSnapshot: () => ({
      ...snapshot, dailyEditorialProof: { privateEvidence: "must-never-leak" },
    }) } as unknown as typeof original;
    const freshness = { status: "fresh" as const,
      checkedAt: new Date("2026-07-06T00:00:00Z") };
    const publicView = presentReaderSummaryArtifact(fixture, freshness) as unknown as Record<string, unknown>;
    expect(publicView).not.toHaveProperty("dailyEditorialProof");
    expect(JSON.stringify(publicView)).not.toContain("must-never-leak");
  });

  it("keeps editorial provenance internal while preserving public rules", () => {
    expect(
      publicReaderSummaryMatchedRules([
        "interest:ai-agents",
        "rule:reader-summary-model-curated",
        "reader-visible-rule",
      ]),
    ).toEqual(["reader-visible-rule"]);
  });
});
