import { STORY_RELATION_APPROVAL_CONFIDENCE_MIN } from "./story-relation-candidates";
import {
  aggregateStoryRelationDecisionTraces,
  reconcileStoryRelationDecisions,
  STORY_RELATION_CANDIDATE_POLICY_VERSION,
  terminalStoryRelationDecisionTraces,
} from "./story-relation-decision-trace";

const approvalThreshold = STORY_RELATION_APPROVAL_CONFIDENCE_MIN;
const rankingPolicyVersion = "story_ranking_v10";

describe("story relation decision trace", () => {
  it("records approved, negative, and below-threshold terminal dispositions", () => {
    const candidates = [candidate("a", "b"), candidate("c", "d"), candidate("e", "f")];
    const result = reconcileStoryRelationDecisions({
      candidates,
      rankingPolicyVersion,
      approvalThreshold,
      decisions: [
        decision("a", "b", true, 0.97),
        decision("c", "d", false, 0.99),
        decision("e", "f", true, 0.91),
      ],
    });

    expect(result.responseAccepted).toBe(true);
    expect(result.approvedPairs).toEqual(new Set(["a\u0000b"]));
    expect(result.traces.map(({ disposition, applied }) => ({ disposition, applied }))).toEqual([
      { disposition: "approved", applied: true },
      { disposition: "rejected_same_story_false", applied: false },
      { disposition: "rejected_below_confidence", applied: false },
    ]);
  });

  it.each([
    ["verifier_unavailable"],
    ["verifier_skipped"],
    ["verifier_failed_closed"],
  ] as const)("records %s once for every shortlisted candidate", (disposition) => {
    const traces = terminalStoryRelationDecisionTraces({
      candidates: [candidate("a", "b"), candidate("c", "d")],
      rankingPolicyVersion,
      approvalThreshold,
      disposition,
    });

    expect(traces.map((trace) => trace.disposition)).toEqual([
      disposition,
      disposition,
    ]);
    expect(traces.every((trace) => !trace.applied)).toBe(true);
  });

  it("fails a partial response closed and identifies returned and missing pairs", () => {
    const result = reconcileStoryRelationDecisions({
      candidates: [candidate("a", "b"), candidate("c", "d")],
      decisions: [decision("a", "b", true, 0.99)],
      rankingPolicyVersion,
      approvalThreshold,
    });

    expect(result.responseAccepted).toBe(false);
    expect(result.approvedPairs.size).toBe(0);
    expect(result.traces.map((trace) => trace.disposition)).toEqual([
      "verifier_failed_closed",
      "verifier_failed_closed",
    ]);
    expect(result.traces.map((trace) => trace.failureReason)).toEqual([
      "missing_response",
      "missing_response",
    ]);
    expect(result.traces.every((trace) => !trace.applied)).toBe(true);
  });

  it("fails duplicate decisions closed with zero applied pairs", () => {
    const repeated = decision("a", "b", true, 0.99);
    const result = reconcileStoryRelationDecisions({
      candidates: [candidate("a", "b")],
      decisions: [repeated, repeated],
      rankingPolicyVersion,
      approvalThreshold,
    });

    expect(result.approvedPairs.size).toBe(0);
    expect(result.traces).toEqual([
      expect.objectContaining({
        disposition: "verifier_failed_closed",
        failureReason: "duplicate_response",
        applied: false,
      }),
    ]);
  });

  it("fails unknown decisions closed without tracing the unmatched pair id", () => {
    const result = reconcileStoryRelationDecisions({
      candidates: [candidate("a", "b")],
      decisions: [decision("unknown-left", "unknown-right", true, 0.99)],
      rankingPolicyVersion,
      approvalThreshold,
    });

    expect(result.approvedPairs.size).toBe(0);
    expect(result.traces).toEqual([
      expect.objectContaining({
        pairId: "a\u0000b",
        disposition: "verifier_failed_closed",
        failureReason: "unmatched_response",
        applied: false,
      }),
    ]);
  });

  it.each([
    [Number.NaN, "decision_confidence_not_finite"],
    [-0.01, "decision_confidence_out_of_range"],
    [1.01, "decision_confidence_out_of_range"],
  ] as const)(
    "fails invalid confidence %s closed with %s",
    (confidenceScore, failureReason) => {
      const result = reconcileStoryRelationDecisions({
        candidates: [candidate("a", "b")],
        decisions: [decision("a", "b", true, confidenceScore)],
        rankingPolicyVersion,
        approvalThreshold,
      });

      expect(result.approvedPairs.size).toBe(0);
      expect(result.traces[0]).toMatchObject({
        disposition: "verifier_failed_closed",
        failureReason,
        applied: false,
      });
    },
  );

  it.each([
    [
      "missing property",
      { leftFeedItemId: "a", rightFeedItemId: "b", confidenceScore: 0.99 },
      "decision_missing_property",
    ],
    [
      "unknown property",
      { ...decision("a", "b", true, 0.99), forceApproval: true },
      "decision_unknown_property",
    ],
  ] as const)("fails a decision with an %s closed", (_name, value, reason) => {
    const result = reconcileStoryRelationDecisions({
      candidates: [candidate("a", "b")],
      decisions: [value],
      rankingPolicyVersion,
      approvalThreshold,
    });

    expect(result.responseAccepted).toBe(false);
    expect(result.approvedPairs.size).toBe(0);
    expect(result.traces[0]).toMatchObject({
      disposition: "verifier_failed_closed",
      failureReason: reason,
      applied: false,
    });
  });

  it.each([
    [null, "decision_invalid_shape"],
    [
      { sameStory: "false", confidenceScore: 0.99 },
      "decision_missing_property",
    ],
  ] as const)(
    "fails unknown decision shape %p closed",
    (invalidDecision, failureReason) => {
      const result = reconcileStoryRelationDecisions({
        candidates: [candidate("a", "b")],
        decisions: [
          decision("a", "b", true, 0.99),
          invalidDecision,
        ],
        rankingPolicyVersion,
        approvalThreshold,
      });

      expect(result.responseAccepted).toBe(false);
      expect(result.approvedPairs.size).toBe(0);
      expect(result.traces[0]).toMatchObject({
        disposition: "verifier_failed_closed",
        failureReason,
        applied: false,
      });
    },
  );

  it("keeps trace order stable and exposes only redacted feature counts", () => {
    const secretToken = "raw-secret-token-must-not-appear";
    const rationale = "Untrusted free text that must never be emitted verbatim";
    const candidates = [
      candidate("z", "y", [secretToken, "shared"]),
      candidate("b", "a", ["other"]),
    ];
    const result = reconcileStoryRelationDecisions({
      candidates,
      decisions: [
        { ...decision("z", "y", false, 0.8), rationale },
        decision("b", "a", false, 0.7),
      ],
      rankingPolicyVersion,
      approvalThreshold,
    });

    expect(result.traces.map((trace) => [trace.pairId, trace.shortlistRank])).toEqual([
      ["y\u0000z", 1],
      ["a\u0000b", 2],
    ]);
    expect(result.traces[0]).toMatchObject({
      candidatePolicyVersion: STORY_RELATION_CANDIDATE_POLICY_VERSION,
      approvalThreshold,
      features: {
        sharedTopicTokenCount: 2,
        sharedAnchorTokenCount: 1,
        sharedEventTokenCount: 1,
        sharedSpecificProductTokenCount: 1,
        topicSimilarity: 0.25,
      },
      confidenceScore: 0.8,
      rationalePresent: true,
      rationaleCharacterCount: rationale.length,
    });
    const serialized = JSON.stringify(result.traces);
    expect(serialized).not.toContain(secretToken);
    expect(serialized).not.toContain(rationale);
    for (const rawFeatureName of [
      "sharedTopicTokens",
      "sharedAnchorTokens",
      "sharedEventTokens",
      "sharedSpecificProductTokens",
    ]) {
      expect(serialized).not.toContain(rawFeatureName);
    }
  });

  it("excludes pre-shortlist filtered and bounds-dropped pairs from candidate traces", () => {
    const materializedShortlist = [candidate("shortlisted-left", "shortlisted-right")];
    const traces = terminalStoryRelationDecisionTraces({
      candidates: materializedShortlist,
      rankingPolicyVersion,
      approvalThreshold,
      disposition: "verifier_unavailable",
    });

    expect(traces.map((trace) => trace.pairId)).toEqual([
      "shortlisted-left\u0000shortlisted-right",
    ]);
    expect(JSON.stringify(traces)).not.toContain("filtered-before-shortlist");
    expect(JSON.stringify(traces)).not.toContain("dropped-by-bounds");
  });

  it("aggregates metrics in stable label order across trace permutations", () => {
    const traces = reconcileStoryRelationDecisions({
      candidates: [candidate("a", "b"), candidate("c", "d")],
      decisions: [decision("a", "b", true, 0.97), decision("c", "d", false, 0.8)],
      rankingPolicyVersion,
      approvalThreshold,
    }).traces;

    expect(aggregateStoryRelationDecisionTraces([...traces].reverse())).toEqual(
      aggregateStoryRelationDecisionTraces(traces),
    );
  });
});

const candidate = (
  leftFeedItemId: string,
  rightFeedItemId: string,
  sharedTopicTokens: readonly string[] = ["shared"],
) => ({
  leftFeedItemId,
  rightFeedItemId,
  leftClusterId: `cluster:${leftFeedItemId}`,
  rightClusterId: `cluster:${rightFeedItemId}`,
  sharedTopicTokens,
  sharedAnchorTokens: ["anchor"],
  sharedEventTokens: ["event"],
  sharedSpecificProductTokens: ["product"],
  topicSimilarity: 0.25,
});

function decision(
  leftFeedItemId: string,
  rightFeedItemId: string,
  sameStory: boolean,
  confidenceScore: number,
) {
  return { leftFeedItemId, rightFeedItemId, sameStory, confidenceScore };
}
