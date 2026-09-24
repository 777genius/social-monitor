import type { ReaderSummaryPreparationManifest } from "../../../domain";

export type ReaderSummaryAssessmentState = {
  readonly id: string;
  readonly state: string;
  readonly accepted_on_time: boolean;
  readonly source_snapshot_sha256: string;
  readonly input_sha256: string;
  readonly rubric_sha256: string;
  readonly model_config_version: string;
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
  return states.every((state) => {
    const candidates = manifest.candidates.filter((candidate) =>
      candidate.assessmentId === state.id);
    return state.state !== "permanent_failed" && candidates.length > 0 &&
      candidates.every((candidate) =>
        candidate.sourceSnapshotSha256 === state.source_snapshot_sha256 &&
        candidate.inputSha256 === state.input_sha256) &&
      manifest.rubricSha256 === state.rubric_sha256 &&
      manifest.modelConfigVersion === state.model_config_version;
  });
};
