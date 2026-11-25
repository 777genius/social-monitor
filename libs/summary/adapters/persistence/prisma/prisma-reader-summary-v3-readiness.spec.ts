import type { ReaderSummaryInterestPreparationManifest,
  ReaderSummaryPreparationManifest } from "../../../domain";
import { readerValueLabels } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import { assessmentStatesMatchManifest, uniqueAssessmentIds,
  visibleCandidateBindingsMatchManifest } from
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

  // Regression: a database read returning the same assessment twice must not
  // hide a missing second assessment during a frozen workspace ready claim.
  it("rejects duplicate assessment rows when one frozen assessment is missing", () => {
    const original = fixture();
    const manifest = { ...original, candidates: [original.candidates[0]!,
      { ...original.candidates[1]!, assessmentId: feedId(101) }] };
    const state = { id: assessmentId, state: "assessed", accepted_on_time: true,
      source_snapshot_sha256: "1".repeat(64), input_sha256: "2".repeat(64),
      rubric_sha256: "3".repeat(64), model_config_version: "jev.v1" };

    expect(assessmentStatesMatchManifest(manifest, [state, state])).toBe(false);
  });

  // Regression: a weekly inventory can contain thousands of distinct
  // assessments; readiness must inspect the complete frozen inventory.
  it("checks every assessment in a large weekly workspace inventory", () => {
    const original = fixture();
    const interestId = feedId(1);
    const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
      interestId, interestSha256: "4".repeat(64),
      rubricVersion: "rubric.v1", rubricSha256: "3".repeat(64),
      inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" };
    const candidates = Array.from({ length: 5_001 }, (_, index) => ({
      ...original.candidates[0]!, candidateId: feedId(index + 1),
      assessmentId: feedId(index + 10_000), interestId }));
    const manifest: ReaderSummaryPreparationManifest = {
      schemaVersion: "reader_summary_preparation_manifest.v2",
      cutoffAt: original.cutoffAt, periodKey: "weekly:test-window",
      interests: [config], candidates };
    const states = candidates.map((candidate) => ({ id: candidate.assessmentId,
      interest_id: interestId, source_item_id: candidate.sourceItemId,
      source_revision_key: candidate.sourceRevisionKey, state: "assessed",
      accepted_on_time: true, source_snapshot_sha256: candidate.sourceSnapshotSha256,
      input_sha256: candidate.inputSha256,
      interest_sha256: config.interestSha256,
      rubric_version: config.rubricVersion,
      rubric_sha256: config.rubricSha256,
      input_builder_version: config.inputBuilderVersion,
      model_config_version: config.modelConfigVersion, result: validAnswers }));

    expect(assessmentStatesMatchManifest(manifest, states)).toBe(true);
    expect(assessmentStatesMatchManifest(manifest, [...states.slice(0, -1),
      states[0]!])).toBe(false);
  });

  // Regression: equal rubric digests must not let a workspace assessment
  // produced under another frozen rubric version pass the ready claim.
  it("rejects a changed per-interest rubric version", () => {
    const original = fixture();
    const interestId = feedId(1);
    const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
      interestId, interestSha256: "4".repeat(64),
      rubricVersion: "rubric.v1", rubricSha256: "3".repeat(64),
      inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" };
    const candidate = { ...original.candidates[0]!, interestId };
    const manifest: ReaderSummaryPreparationManifest = {
      schemaVersion: "reader_summary_preparation_manifest.v2",
      cutoffAt: original.cutoffAt, periodKey: "daily:test-window",
      interests: [config], candidates: [candidate] };
    const state = { id: candidate.assessmentId, interest_id: interestId,
      source_item_id: candidate.sourceItemId,
      source_revision_key: candidate.sourceRevisionKey, state: "assessed",
      accepted_on_time: true,
      source_snapshot_sha256: candidate.sourceSnapshotSha256,
      input_sha256: candidate.inputSha256,
      interest_sha256: config.interestSha256,
      rubric_version: "rubric.v2",
      rubric_sha256: config.rubricSha256,
      input_builder_version: config.inputBuilderVersion,
      model_config_version: config.modelConfigVersion, result: validAnswers };

    expect(assessmentStatesMatchManifest(manifest, [state])).toBe(false);
    expect(assessmentStatesMatchManifest(manifest, [{ ...state,
      rubric_version: config.rubricVersion }])).toBe(true);
    // Regression: matching rubric alone cannot cover a changed interest query
    // or input builder before a workspace execution is claimed.
    expect(assessmentStatesMatchManifest(manifest, [{ ...state,
      rubric_version: config.rubricVersion,
      interest_sha256: "0".repeat(64) }])).toBe(false);
    expect(assessmentStatesMatchManifest(manifest, [{ ...state,
      rubric_version: config.rubricVersion,
      input_builder_version: "input.v2" }])).toBe(false);
    // Regression: a row marked assessed with malformed answers must not claim
    // a frozen workspace job and later be mistaken for truthful no signal.
    expect(assessmentStatesMatchManifest(manifest, [{ ...state,
      rubric_version: config.rubricVersion,
      result: { usefulness: { choice: "noise" } } }])).toBe(false);
  });

  // Regression: a pooled workspace may not use one interest's assessment for
  // another interest even when source and input digests happen to match.
  it("rejects an unqualified cross-interest readiness hit", () => {
    const original = fixture();
    if (original.schemaVersion !== "reader_summary_preparation_manifest.v1") return;
    const manifest: ReaderSummaryPreparationManifest = {
      schemaVersion: "reader_summary_preparation_manifest.v2",
      cutoffAt: original.cutoffAt,
      periodKey: "daily:test-window",
      interests: [1, 2].map((value) => ({
        schemaVersion: "reader_summary_preparation_config.v1" as const,
        interestId: feedId(value), interestSha256: "4".repeat(64),
        rubricVersion: "rubric.v1", rubricSha256: "3".repeat(64),
        inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" })),
      candidates: original.candidates.map((candidate, index) => ({
        ...candidate, interestId: feedId(index + 1) })),
    };
    const state = { id: assessmentId, interest_id: feedId(1),
      source_item_id: feedId(20), source_revision_key: "revision",
      state: "assessed", accepted_on_time: true,
      source_snapshot_sha256: "1".repeat(64), input_sha256: "2".repeat(64),
      rubric_sha256: "3".repeat(64), model_config_version: "jev.v1",
      result: validAnswers };

    expect(assessmentStatesMatchManifest(manifest, [state])).toBe(false);
  });

  // Regression: a FeedItem that is rebound to another live source after
  // preparation retains its id and interest, but no longer has the frozen
  // evidence identity. Both ready claim and publication must reject it.
  it("rejects a changed workspace source binding despite a visible FeedItem", () => {
    const original = fixture();
    const interestId = feedId(1);
    const manifest: ReaderSummaryPreparationManifest = {
      schemaVersion: "reader_summary_preparation_manifest.v2",
      cutoffAt: original.cutoffAt,
      periodKey: "daily:test-window",
      interests: [{ schemaVersion: "reader_summary_preparation_config.v1",
        interestId, interestSha256: "4".repeat(64),
        rubricVersion: "rubric.v1", rubricSha256: "3".repeat(64),
        inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" }],
      candidates: [{ ...original.candidates[0]!, interestId }],
    };
    const candidate = manifest.candidates[0]!;
    const live = [{ id: candidate.candidateId, interest_id: interestId,
      source_item_id: candidate.sourceItemId,
      source_binding_id: candidate.sourceBindingId,
      provider_key: candidate.providerKey }];

    expect(visibleCandidateBindingsMatchManifest(manifest, live, interestId))
      .toBe(true);
    expect(visibleCandidateBindingsMatchManifest(manifest, [{ ...live[0]!,
      source_binding_id: feedId(99) }], interestId)).toBe(false);
  });
});

const fixture = (): ReaderSummaryInterestPreparationManifest => ({
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
const validAnswers = Object.fromEntries(Object.entries(readerValueLabels).map(
  ([criterion, labels]) => [criterion, { choice: labels[0],
    probabilities: Object.fromEntries(labels.map((label, index) =>
      [label, index === 0 ? 1 : 0])), confidence: 1,
    choiceDiffersFromArgmax: false, probabilityTie: false }]));
const feedId = (ordinal: number) =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
