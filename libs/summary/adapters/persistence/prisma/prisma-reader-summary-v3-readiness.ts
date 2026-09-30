import type { ReaderSummaryPreparationManifest } from "../../../domain";
import { validateReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

export type ReaderSummaryAssessmentState = {
  readonly id: string;
  readonly interest_id?: string;
  readonly source_item_id?: string;
  readonly source_revision_key?: string;
  readonly state: string;
  readonly accepted_on_time: boolean;
  readonly source_snapshot_sha256: string;
  readonly input_sha256: string;
  readonly interest_sha256?: string;
  readonly rubric_version?: string;
  readonly rubric_sha256: string;
  readonly input_builder_version?: string;
  readonly model_config_version: string;
  readonly result?: unknown;
};

export type ReaderSummaryVisibleCandidate = {
  readonly id: string;
  readonly interest_id: string;
  readonly source_item_id: string;
  readonly source_binding_id: string;
  readonly provider_key: string;
};

export const visibleCandidateBindingsMatchManifest = (
  manifest: ReaderSummaryPreparationManifest,
  rows: readonly ReaderSummaryVisibleCandidate[],
  interestIdForV1: string,
): boolean => {
  if (rows.length !== manifest.candidates.length) return false;
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length) return false;
  return manifest.candidates.every((candidate) => {
    const row = byId.get(candidate.candidateId);
    const interestId = manifest.schemaVersion ===
      "reader_summary_preparation_manifest.v2"
      ? (candidate as typeof candidate & { readonly interestId?: string }).interestId
      : interestIdForV1;
    return row !== undefined && row.interest_id === interestId &&
      row.source_item_id === candidate.sourceItemId &&
      row.source_binding_id === candidate.sourceBindingId &&
      row.provider_key === candidate.providerKey;
  });
};

export const uniqueAssessmentIds = (
  manifest: ReaderSummaryPreparationManifest,
): readonly string[] => [...new Set(manifest.candidates.map((candidate) =>
  candidate.assessmentId))].sort();

export const assessmentStatesMatchManifest = (
  manifest: ReaderSummaryPreparationManifest,
  states: readonly ReaderSummaryAssessmentState[],
): boolean => {
  const ids = uniqueAssessmentIds(manifest);
  if (states.length !== ids.length) return false;
  const candidatesByAssessment = new Map<string,
    typeof manifest.candidates[number][]>();
  for (const candidate of manifest.candidates) {
    const group = candidatesByAssessment.get(candidate.assessmentId);
    if (group === undefined) candidatesByAssessment.set(candidate.assessmentId,
      [candidate]);
    else group.push(candidate);
  }
  const configByInterest = manifest.schemaVersion ===
    "reader_summary_preparation_manifest.v2"
    ? new Map(manifest.interests.map((interest) =>
      [interest.interestId, interest] as const)) : undefined;
  const seen = new Set<string>();
  return states.every((state) => {
    const candidates = candidatesByAssessment.get(state.id) ?? [];
    if (seen.has(state.id)) return false;
    seen.add(state.id);
    return state.state !== "permanent_failed" && candidates.length > 0 &&
      (manifest.schemaVersion !== "reader_summary_preparation_manifest.v2" ||
        state.state !== "assessed" || validateReaderValueAnswers(state.result).ok) &&
      candidates.every((candidate) =>
        candidate.sourceSnapshotSha256 === state.source_snapshot_sha256 &&
        candidate.inputSha256 === state.input_sha256 &&
        (manifest.schemaVersion !== "reader_summary_preparation_manifest.v2" ||
          candidate.sourceItemId === state.source_item_id &&
          candidate.sourceRevisionKey === state.source_revision_key)) &&
      candidates.every((candidate) => {
        const config = manifest.schemaVersion === "reader_summary_preparation_manifest.v2"
          ? configByInterest?.get((candidate as typeof manifest.candidates[number]).interestId)
          : manifest;
        return config !== undefined &&
          (manifest.schemaVersion !== "reader_summary_preparation_manifest.v2" ||
            state.interest_id ===
              (candidate as typeof manifest.candidates[number]).interestId &&
            state.interest_sha256 === config.interestSha256 &&
            "rubricVersion" in config &&
            state.rubric_version === config.rubricVersion &&
            state.input_builder_version === config.inputBuilderVersion) &&
          config.rubricSha256 === state.rubric_sha256 &&
          config.modelConfigVersion === state.model_config_version;
      });
  });
};
