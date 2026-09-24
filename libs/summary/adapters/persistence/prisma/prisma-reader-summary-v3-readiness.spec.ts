import type { ReaderSummaryPreparationManifest } from "../../../domain";
import { assessmentStatesMatchManifest, uniqueAssessmentIds } from
  "./prisma-reader-summary-v3-readiness";

describe("V3 assessment readiness bindings", () => {
  it("queries a shared exact assessment once while preserving both FeedItem bindings", () => {
    const manifest = fixture();
    const state = { id: assessmentId, state: "assessed", accepted_on_time: true,
      source_snapshot_sha256: "1".repeat(64), input_sha256: "2".repeat(64),
      rubric_sha256: "3".repeat(64), model_config_version: "jev.v1" };

    expect(uniqueAssessmentIds(manifest)).toEqual([assessmentId]);
    expect(manifest.candidates.map((candidate) => candidate.candidateId))
      .toEqual([feedId(1), feedId(2)]);
    expect(assessmentStatesMatchManifest(manifest, [state])).toBe(true);
  });

  it("rejects when either FeedItem binding disagrees with the shared assessment", () => {
    const manifest = fixture();
    const changed = { ...manifest, candidates: [manifest.candidates[0]!,
      { ...manifest.candidates[1]!, inputSha256: "9".repeat(64) }] };
    expect(assessmentStatesMatchManifest(changed, [{ id: assessmentId,
      state: "assessed", accepted_on_time: true,
      source_snapshot_sha256: "1".repeat(64), input_sha256: "2".repeat(64),
      rubric_sha256: "3".repeat(64), model_config_version: "jev.v1" }]))
      .toBe(false);
  });
});

const fixture = (): ReaderSummaryPreparationManifest => ({
  schemaVersion: "reader_summary_preparation_manifest.v1",
  cutoffAt: "2026-09-21T00:00:00.000000Z", interestSha256: "4".repeat(64),
  rubricSha256: "3".repeat(64), inputBuilderVersion: "input.v1",
  modelConfigVersion: "jev.v1", candidates: [1, 2].map((ordinal) => ({
    candidateId: feedId(ordinal), sourceBindingId: feedId(ordinal + 10),
    providerKey: "rss", sourceItemId: feedId(20), sourceRevisionKey: "revision",
    sourceSnapshotSha256: "1".repeat(64), assessmentId,
    inputSha256: "2".repeat(64), publishedAt: "2026-09-20T00:00:00.000001Z",
    observedAt: "2026-09-20T00:00:01.000001Z", sourceKind: "article",
    canonicalIdentity: `https://example.test/${ordinal}` })) });

const assessmentId = "00000000-0000-4000-8000-000000000100";
const feedId = (ordinal: number) =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
