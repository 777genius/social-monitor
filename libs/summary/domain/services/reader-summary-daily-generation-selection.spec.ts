import { selectReaderSummaryDailyGenerationInput, type ReaderSummaryDailyGenerationCandidate } from "./reader-summary-daily-generation-selection";
import { readReaderSummaryDailyGenerationInput } from "../value-objects/reader-summary-daily-generation-input";

const candidate = (id: number, nativeCount: number | null = 100 - id): ReaderSummaryDailyGenerationCandidate => ({
  feedItemId: `feed-${id}`, sourceItemId: `source-${id}`, assessmentId: `assessment-${id}`,
  interestId: "interest", publishedAt: "2026-11-01T12:00:00.000000Z", observedAt: "2026-11-02T12:00:00.000000Z",
  sourceSnapshotSha256: "a".repeat(64), inputSha256: "b".repeat(64), storyId: `story-${id}`,
  providerKey: "x-twitter", providerFamily: "x", nativeCount,
  engagementObservedAt: "2026-11-02T12:00:00.000000Z", canonicalIdentity: `https://x.com/author/status/${id}`,
  safe: true, contextAvailable: true,
});
const select = (candidates: readonly ReaderSummaryDailyGenerationCandidate[]) => selectReaderSummaryDailyGenerationInput({
  candidates, manifestSha256: "c".repeat(64), periodKey: "daily:Nov1", cutoffAt: "2026-11-03T00:00:00.000000Z",
});

it("keeps raw native-count order and backfills thirty unique stories after duplicate and context exclusions", () => {
  const values = Array.from({ length: 35 }, (_, index) => candidate(index + 1));
  values[1] = { ...values[1]!, storyId: values[0]!.storyId };
  values[2] = { ...values[2]!, contextAvailable: false };
  values[3] = { ...values[3]!, safe: false };
  const proof = select(values.reverse());
  expect(proof.selected.map(entry => entry.feedItemId)).toEqual(["feed-1", ...Array.from({ length: 29 }, (_, index) => `feed-${index + 5}`)]);
  expect(proof.excluded).toContainEqual({ feedItemId: "feed-2", reason: "duplicate_story" });
  expect(proof.excluded).toContainEqual({ feedItemId: "feed-3", reason: "missing_context" });
  expect(proof.excluded).toContainEqual({ feedItemId: "feed-4", reason: "unsafe_source" });
  expect(readReaderSummaryDailyGenerationInput(proof)).toEqual(proof);
});

it("keeps genuine zero before unknown, deterministic date/id ties and GitHub outside the ordinary pool", () => {
  const proof = select([candidate(3, null), candidate(2, 0), candidate(1, 0),
    { ...candidate(4, 10000), providerKey: "github-trending-page", providerFamily: "github" }]);
  expect(proof.selected.map(entry => entry.feedItemId)).toEqual(["feed-1", "feed-2", "feed-3"]);
  expect(proof.excluded).toEqual([{ feedItemId: "feed-4", reason: "appendix_only" }]);
});

it("rejects malformed/unknown present proof rather than turning it into legacy authority", () => {
  const proof = select([candidate(1), candidate(2)]);
  expect(readReaderSummaryDailyGenerationInput({ ...proof, policyVersion: "unknown" })).toBeUndefined();
  expect(readReaderSummaryDailyGenerationInput({ ...proof, selected: [proof.selected[0], proof.selected[0]] })).toBeUndefined();
  expect(readReaderSummaryDailyGenerationInput({ ...proof, sent: { payloadSha256: "d".repeat(64),
    evidence: [{ feedItemId: "unseen", sha256: "e".repeat(64) }] } })).toBeUndefined();
});
