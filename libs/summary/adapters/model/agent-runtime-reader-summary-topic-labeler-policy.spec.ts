import type {
  ReaderSummaryTopicLabelCandidate,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { buildAgentRuntimeTopicLabelerPromptPolicy } from "./agent-runtime-reader-summary-topic-labeler-policy";

const candidate = (
  nodeId: string,
  keywords: readonly string[],
): ReaderSummaryTopicLabelCandidate => ({
  nodeId,
  storyClusterId: `story:${nodeId}`,
  fallbackLabel: keywords[0] ?? nodeId,
  score: 1,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["interest:ai"],
  keywords,
  labelCandidates: [],
});

describe("Agent Runtime topic labeler prompt policy", () => {
  it("preserves ordered taxonomy constraints and null first-attempt feedback", () => {
    const policy = buildAgentRuntimeTopicLabelerPromptPolicy([]);

    expect(Object.keys(policy)).toEqual([
      "retryFeedback",
      "constraints",
      "requiredGroundedCohorts",
    ]);
    expect(policy.retryFeedback).toBeNull();
    expect(policy.constraints).toMatchObject({
      maxLabelWords: 4,
      minimumNodesPerSemanticGroup: 2,
      preserveNodeIds: true,
      sameTopicIdMergesBubble: true,
      topicIdFormat: "topic:<stable-short-slug>",
      groupIdFormat: "group:<semantic-family-slug>",
      claimTypes: expect.arrayContaining(["comparison", "other"]),
    });
    expect(policy.requiredGroundedCohorts).toEqual({
      minimumGroupedNodeCount: 0,
      instruction: expect.any(String),
      groups: [],
    });
  });

  it("ceil-rounds retry coverage without altering caller feedback", () => {
    const candidates = [
      candidate("node:a", ["Alpha"]),
      candidate("node:b", ["Beta"]),
      candidate("node:c", ["Gamma"]),
    ];
    const attempt: ReaderSummaryTopicMapAttemptContext = {
      attemptNumber: 2,
      totalAttempts: 3,
      retryFeedback: {
        reason: "grouped_coverage_below_minimum",
        previousGroupedCoverage: 0.25,
        minimumGroupedCoverage: 0.5,
      },
    };
    const before = { ...attempt.retryFeedback };
    const policy = buildAgentRuntimeTopicLabelerPromptPolicy(candidates, attempt);

    expect(policy.retryFeedback).toEqual({
      ...before,
      minimumGroupedNodeCount: 2,
      instruction:
        "The previous map was rejected only for low grouped coverage. Rebuild the global taxonomy, keep distinct stories as distinct topicId values, and group at least the minimum node count when grounded broad domains support it.",
    });
    expect(attempt.retryFeedback).toEqual(before);
  });

  it("projects required anchored cohorts with original distinct node identities", () => {
    const candidates = [
      candidate("node:rust-a", ["Rust"]),
      candidate("node:rust-b", ["Rust"]),
      candidate("node:unrelated", ["Unrelated"]),
    ];

    const policy = buildAgentRuntimeTopicLabelerPromptPolicy(candidates);
    expect(policy.requiredGroundedCohorts).toMatchObject({
      minimumGroupedNodeCount: 2,
      groups: [
        {
          groupId: "group:rust",
          nodeIds: ["node:rust-a", "node:rust-b"],
          sharedAnchor: "rust",
        },
      ],
    });
    expect(candidates.map((item) => item.nodeId)).toEqual([
      "node:rust-a",
      "node:rust-b",
      "node:unrelated",
    ]);
  });
});
