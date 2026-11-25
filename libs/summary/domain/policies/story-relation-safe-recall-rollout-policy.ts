export const STORY_RELATION_SAFE_RECALL_ROLLOUT_POLICY_VERSION =
  "reader_summary.story_relation.safe_recall_rollout.v1";

export const STORY_RELATION_SAFE_RECALL_ROLLOUT_THRESHOLDS = {
  minimumObservationWindows: 7,
  minimumReviewedCandidates: 100,
  minimumPrecision: 0.99,
  minimumRecallLift: 0.03,
  maximumVerifierFailureRate: 0.01,
} as const;

export type StoryRelationSafeRecallRolloutEvidence = {
  readonly observationWindowCount: number;
  readonly reviewedCandidateCount: number;
  readonly truePositiveCount: number;
  readonly falsePositiveCount: number;
  readonly recallLift: number;
  readonly verifierAttemptCount: number;
  readonly verifierFailedClosedCount: number;
  readonly relatedOnlyFalseMergeCount: number;
  readonly productionMutationCount: number;
  readonly telemetryIsolationFailureCount: number;
};

export type StoryRelationSafeRecallRolloutRejectionReason =
  | "invalid_evidence"
  | "insufficient_observation_windows"
  | "insufficient_reviewed_candidates"
  | "precision_below_minimum"
  | "recall_lift_below_minimum"
  | "verifier_failure_rate_above_maximum"
  | "related_only_false_merge_detected"
  | "production_mutation_detected"
  | "telemetry_isolation_failure_detected";

export type StoryRelationSafeRecallRolloutDecision = {
  readonly policyVersion: typeof STORY_RELATION_SAFE_RECALL_ROLLOUT_POLICY_VERSION;
  readonly accepted: boolean;
  readonly rejectionReasons: readonly StoryRelationSafeRecallRolloutRejectionReason[];
  readonly observedPrecision?: number;
  readonly observedVerifierFailureRate?: number;
};

/**
 * Shadow exit gate only. Passing it does not activate production behavior;
 * cluster union, thresholds, and caps still require a separate reviewed change.
 */
export const evaluateStoryRelationSafeRecallRollout = (
  evidence: StoryRelationSafeRecallRolloutEvidence,
): StoryRelationSafeRecallRolloutDecision => {
  const reviewedPositiveCount =
    evidence.truePositiveCount + evidence.falsePositiveCount;
  const observedPrecision =
    reviewedPositiveCount === 0
      ? undefined
      : evidence.truePositiveCount / reviewedPositiveCount;
  const observedVerifierFailureRate =
    evidence.verifierAttemptCount === 0
      ? undefined
      : evidence.verifierFailedClosedCount / evidence.verifierAttemptCount;
  const rejectionReasons: StoryRelationSafeRecallRolloutRejectionReason[] = [];

  if (!isValidRolloutEvidence(evidence)) {
    rejectionReasons.push("invalid_evidence");
  }

  if (
    evidence.observationWindowCount <
    STORY_RELATION_SAFE_RECALL_ROLLOUT_THRESHOLDS.minimumObservationWindows
  ) {
    rejectionReasons.push("insufficient_observation_windows");
  }
  if (
    evidence.reviewedCandidateCount <
    STORY_RELATION_SAFE_RECALL_ROLLOUT_THRESHOLDS.minimumReviewedCandidates
  ) {
    rejectionReasons.push("insufficient_reviewed_candidates");
  }
  if (
    observedPrecision === undefined ||
    observedPrecision <
      STORY_RELATION_SAFE_RECALL_ROLLOUT_THRESHOLDS.minimumPrecision
  ) {
    rejectionReasons.push("precision_below_minimum");
  }
  if (
    !Number.isFinite(evidence.recallLift) ||
    evidence.recallLift <
      STORY_RELATION_SAFE_RECALL_ROLLOUT_THRESHOLDS.minimumRecallLift
  ) {
    rejectionReasons.push("recall_lift_below_minimum");
  }
  if (
    observedVerifierFailureRate === undefined ||
    observedVerifierFailureRate >
      STORY_RELATION_SAFE_RECALL_ROLLOUT_THRESHOLDS.maximumVerifierFailureRate
  ) {
    rejectionReasons.push("verifier_failure_rate_above_maximum");
  }
  if (evidence.relatedOnlyFalseMergeCount !== 0) {
    rejectionReasons.push("related_only_false_merge_detected");
  }
  if (evidence.productionMutationCount !== 0) {
    rejectionReasons.push("production_mutation_detected");
  }
  if (evidence.telemetryIsolationFailureCount !== 0) {
    rejectionReasons.push("telemetry_isolation_failure_detected");
  }

  return {
    policyVersion: STORY_RELATION_SAFE_RECALL_ROLLOUT_POLICY_VERSION,
    accepted: rejectionReasons.length === 0,
    rejectionReasons,
    ...(observedPrecision === undefined ? {} : { observedPrecision }),
    ...(observedVerifierFailureRate === undefined
      ? {}
      : { observedVerifierFailureRate }),
  };
};

const isValidRolloutEvidence = (
  evidence: StoryRelationSafeRecallRolloutEvidence,
): boolean => {
  const counts = [
    evidence.observationWindowCount,
    evidence.reviewedCandidateCount,
    evidence.truePositiveCount,
    evidence.falsePositiveCount,
    evidence.verifierAttemptCount,
    evidence.verifierFailedClosedCount,
    evidence.relatedOnlyFalseMergeCount,
    evidence.productionMutationCount,
    evidence.telemetryIsolationFailureCount,
  ];
  return (
    counts.every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) &&
    evidence.truePositiveCount + evidence.falsePositiveCount ===
      evidence.reviewedCandidateCount &&
    evidence.verifierFailedClosedCount <= evidence.verifierAttemptCount
    && Number.isFinite(evidence.recallLift)
    && evidence.recallLift >= 0
    && evidence.recallLift <= 1
  );
};
