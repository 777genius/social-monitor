import type { ReaderSummaryModelInput } from "../../ports";
import { selectClustersForEvidence } from "./deterministic-reader-summary-evidence-selection";

describe("deterministic reader summary cluster selection", () => {
  const date = new Date("2026-06-23T08:00:00.000Z");
  const clusters: ReaderSummaryModelInput["evidence"]["clusters"] = [
    "alpha",
    "beta",
    "gamma",
  ].map((id) => ({
    id,
    storyKey: `story-key-${id}`,
    representativeFeedItemId: `feed-${id}`,
    duplicateFeedItemIds: [],
    interestIds: ["interest-1"],
    providerKeys: ["github"],
    score: 1,
    observedAtRange: { startedAt: date, endedAt: date },
    whyImportant: ["Synthetic fixture"],
  }));

  it("prioritizes pinned clusters, deduplicates pins and honors the story cap", () => {
    const selected = selectClustersForEvidence(clusters, [], 2, [
      "gamma", "gamma", "alpha",
    ]);
    expect(selected.map((cluster) => cluster.id)).toEqual(["gamma", "alpha"]);
  });

  it("skips missing pins and preserves ordered fallback on an invalid cap", () => {
    const selected = selectClustersForEvidence(clusters, [], 0, ["missing"]);
    expect(selected.map((cluster) => cluster.id)).toEqual(["alpha"]);
  });
});
