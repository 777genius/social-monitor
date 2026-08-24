import {
  evaluateStoryRelationSafeRecallRollout,
  STORY_RELATION_SAFE_RECALL_ROLLOUT_POLICY_VERSION,
  type StoryRelationSafeRecallRolloutEvidence,
} from "./story-relation-safe-recall-rollout-policy";

describe("story relation safe-recall rollout acceptance", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])(
    "rejects out-of-range recall lift %s as invalid evidence",
    (recallLift) => {
      const decision = evaluateStoryRelationSafeRecallRollout({
        ...acceptableEvidence(),
        recallLift,
      });

      expect(decision.accepted).toBe(false);
      expect(decision.rejectionReasons).toContain("invalid_evidence");
    },
  );

  it.each([0, 1])("accepts recall lift boundary %s as structurally valid", (recallLift) => {
    const decision = evaluateStoryRelationSafeRecallRollout({
      ...acceptableEvidence(),
      recallLift,
    });

    expect(decision.rejectionReasons).not.toContain("invalid_evidence");
  });
  it("accepts only sufficient high-precision recall evidence with zero safety violations", () => {
    expect(evaluateStoryRelationSafeRecallRollout(acceptableEvidence())).toEqual({
      policyVersion: STORY_RELATION_SAFE_RECALL_ROLLOUT_POLICY_VERSION,
      accepted: true,
      rejectionReasons: [],
      observedPrecision: 0.99,
      observedVerifierFailureRate: 0.01,
    });
  });

  it("fails closed when observation, precision, recall, or reliability is weak", () => {
    expect(
      evaluateStoryRelationSafeRecallRollout({
        ...acceptableEvidence(),
        observationWindowCount: 6,
        reviewedCandidateCount: 99,
        truePositiveCount: 97,
        falsePositiveCount: 2,
        recallLift: 0.029,
        verifierFailedClosedCount: 2,
      }).rejectionReasons,
    ).toEqual([
      "insufficient_observation_windows",
      "insufficient_reviewed_candidates",
      "precision_below_minimum",
      "recall_lift_below_minimum",
      "verifier_failure_rate_above_maximum",
    ]);
  });

  it.each([
    ["relatedOnlyFalseMergeCount", "related_only_false_merge_detected"],
    ["productionMutationCount", "production_mutation_detected"],
    ["telemetryIsolationFailureCount", "telemetry_isolation_failure_detected"],
  ] as const)("rejects nonzero %s", (field, reason) => {
    expect(
      evaluateStoryRelationSafeRecallRollout({
        ...acceptableEvidence(),
        [field]: 1,
      }).rejectionReasons,
    ).toContain(reason);
  });

  it("does not treat an empty denominator as acceptable evidence", () => {
    const decision = evaluateStoryRelationSafeRecallRollout({
      ...acceptableEvidence(),
      truePositiveCount: 0,
      falsePositiveCount: 0,
      verifierAttemptCount: 0,
      verifierFailedClosedCount: 0,
    });

    expect(decision.observedPrecision).toBeUndefined();
    expect(decision.observedVerifierFailureRate).toBeUndefined();
    expect(decision.rejectionReasons).toEqual(
      expect.arrayContaining([
        "precision_below_minimum",
        "verifier_failure_rate_above_maximum",
      ]),
    );
  });

  it("rejects malformed aggregate evidence", () => {
    expect(
      evaluateStoryRelationSafeRecallRollout({
        ...acceptableEvidence(),
        verifierFailedClosedCount: 101,
      }).rejectionReasons,
    ).toContain("invalid_evidence");
  });

  it("cannot inflate one labeled outcome into one hundred reviews", () => {
    expect(
      evaluateStoryRelationSafeRecallRollout({
        ...acceptableEvidence(),
        reviewedCandidateCount: 100,
        truePositiveCount: 1,
        falsePositiveCount: 0,
      }).rejectionReasons,
    ).toContain("invalid_evidence");
  });
});

const acceptableEvidence = (): StoryRelationSafeRecallRolloutEvidence => ({
  observationWindowCount: 7,
  reviewedCandidateCount: 100,
  truePositiveCount: 99,
  falsePositiveCount: 1,
  recallLift: 0.03,
  verifierAttemptCount: 100,
  verifierFailedClosedCount: 1,
  relatedOnlyFalseMergeCount: 0,
  productionMutationCount: 0,
  telemetryIsolationFailureCount: 0,
});
