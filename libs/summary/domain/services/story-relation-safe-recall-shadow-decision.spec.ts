import { STORY_RELATION_APPROVAL_CONFIDENCE_MIN } from "./story-relation-candidates";
import {
  reconcileStoryRelationSafeRecallShadowDecisions,
  terminalStoryRelationSafeRecallShadowTraces,
} from "./story-relation-safe-recall-shadow-decision";
import {
  STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION,
  type StoryRelationSafeRecallShadowCandidate,
} from "./story-relation-safe-recall-shadow";

describe("story relation safe-recall shadow decisions", () => {
  it("records a weak Reddit watermark candidate as rejected and never applied", () => {
    const candidate = shadowCandidate("official", "reddit");
    const batch = reconcileStoryRelationSafeRecallShadowDecisions({
      candidates: [candidate],
      decisions: [
        {
          leftFeedItemId: "official",
          rightFeedItemId: "reddit",
          sameStory: false,
          confidenceScore: 0.99,
          rationale: "The Reddit question does not report the announcement.",
        },
      ],
      rankingPolicyVersion: "ranking-v1",
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
    });

    expect(batch.responseAccepted).toBe(true);
    expect(batch.wouldApproveCount).toBe(0);
    expect(batch.traces).toEqual([
      expect.objectContaining({
        disposition: "rejected_same_story_false",
        wouldApprove: false,
        candidatePolicyVersion:
          STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION,
        applied: false,
      }),
    ]);
    expect(JSON.stringify(batch.aggregates)).not.toContain("official");
    expect(JSON.stringify(batch.aggregates)).not.toContain("Reddit question");
  });

  it("fails a partial verifier response closed for every shadow candidate", () => {
    const batch = reconcileStoryRelationSafeRecallShadowDecisions({
      candidates: [
        shadowCandidate("a", "b"),
        shadowCandidate("b", "c"),
      ],
      decisions: [decision("a", "b", true)],
      rankingPolicyVersion: "ranking-v1",
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
    });

    expect(batch.responseAccepted).toBe(false);
    expect(batch.wouldApproveCount).toBe(0);
    expect(batch.traces).toEqual([
      expect.objectContaining({
        disposition: "verifier_failed_closed",
        failureReason: "missing_response",
        applied: false,
      }),
      expect.objectContaining({
        disposition: "verifier_failed_closed",
        failureReason: "missing_response",
        applied: false,
      }),
    ]);
  });

  it("keeps approved chains observational so they cannot create transitive union", () => {
    const batch = reconcileStoryRelationSafeRecallShadowDecisions({
      candidates: [
        shadowCandidate("a", "b"),
        shadowCandidate("b", "c"),
      ],
      decisions: [decision("a", "b", true), decision("b", "c", true)],
      rankingPolicyVersion: "ranking-v1",
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
    });

    expect(batch.wouldApproveCount).toBe(2);
    expect(batch.traces.every((trace) => !trace.applied)).toBe(true);
    expect(batch.traces.every((trace) => trace.wouldApprove)).toBe(true);
    expect(batch).not.toHaveProperty("approvedPairs");
  });

  it("creates aggregate-only terminal traces for unavailable verification", () => {
    const traces = terminalStoryRelationSafeRecallShadowTraces({
      candidates: [shadowCandidate("raw-left", "raw-right")],
      rankingPolicyVersion: "ranking-v1",
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
      disposition: "verifier_unavailable",
    });

    expect(traces[0]).toMatchObject({
      pairId: "raw-left\u0000raw-right",
      disposition: "verifier_unavailable",
      applied: false,
    });
  });
});

const shadowCandidate = (
  leftFeedItemId: string,
  rightFeedItemId: string,
): StoryRelationSafeRecallShadowCandidate => ({
  leftFeedItemId,
  rightFeedItemId,
  leftClusterId: `cluster:${leftFeedItemId}`,
  rightClusterId: `cluster:${rightFeedItemId}`,
  sharedTopicTokens: ["claude", "watermark", "event:watermark"],
  sharedAnchorTokens: ["claude", "watermark"],
  sharedEventTokens: ["event:watermark"],
  sharedSpecificProductTokens: [],
  topicSimilarity: 0.25,
  shadowReasonCode: "title_normalized_entity_event_evidence",
  titleSharedIdentityTokenCount: 2,
  titleSharedEventTokenCount: 1,
  bodySharedTokenCount: 0,
});

const decision = (
  leftFeedItemId: string,
  rightFeedItemId: string,
  sameStory: boolean,
) => ({
  leftFeedItemId,
  rightFeedItemId,
  sameStory,
  confidenceScore: 0.99,
});
