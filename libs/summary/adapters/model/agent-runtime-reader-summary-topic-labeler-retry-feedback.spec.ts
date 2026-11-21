import type {
  ReaderSummaryTopicLabelCandidate,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { projectAgentRuntimeTopicLabelRetryFeedback } from "./agent-runtime-reader-summary-topic-labeler-retry-feedback";
import { buildAgentRuntimeTopicLabelerPromptPolicy } from "./agent-runtime-reader-summary-topic-labeler-policy";

const candidate = (nodeId: string): ReaderSummaryTopicLabelCandidate => ({
  nodeId,
  storyClusterId: `story:${nodeId}`,
  fallbackLabel: nodeId,
  score: 1,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["interest:test"],
  keywords: [nodeId],
  labelCandidates: [],
});

describe("topic label retry feedback responsibility", () => {
  const candidates = [candidate("alpha"), candidate("beta"), candidate("gamma")];
  const feedback = Object.freeze({
    reason: "grouped_coverage_below_minimum" as const,
    previousGroupedCoverage: 0.25,
    minimumGroupedCoverage: 0.5,
  });
  const attempt: ReaderSummaryTopicMapAttemptContext = Object.freeze({
    attemptNumber: 2,
    totalAttempts: 3,
    retryFeedback: feedback,
  });

  it("omits absent feedback without adding or fabricating a retry", () => {
    expect(projectAgentRuntimeTopicLabelRetryFeedback(candidates)).toBeNull();
    expect(projectAgentRuntimeTopicLabelRetryFeedback(candidates, {
      attemptNumber: 1,
      totalAttempts: 3,
    })).toBeNull();
    expect(buildAgentRuntimeTopicLabelerPromptPolicy(candidates).retryFeedback).toBeNull();
  });

  it("preserves feedback field order, exact instruction, ceiling and immutable inputs", () => {
    const original = JSON.stringify({ candidates, attempt });
    const expected = {
      ...feedback,
      minimumGroupedNodeCount: 2,
      instruction:
        "The previous map was rejected only for low grouped coverage. Rebuild the global taxonomy, keep distinct stories as distinct topicId values, and group at least the minimum node count when grounded broad domains support it.",
    };
    const result = projectAgentRuntimeTopicLabelRetryFeedback(candidates, attempt);
    expect(result).toEqual(expected);
    expect(Object.keys(result ?? {})).toEqual([
      "reason", "previousGroupedCoverage", "minimumGroupedCoverage",
      "minimumGroupedNodeCount", "instruction",
    ]);
    expect(result).not.toBe(feedback);
    expect(JSON.stringify({ candidates, attempt })).toBe(original);
    expect(buildAgentRuntimeTopicLabelerPromptPolicy(candidates, attempt).retryFeedback).toEqual(expected);
  });

  it("keeps zero, exact and fractional grouped-node thresholds deterministic", () => {
    const withCoverage = (minimumGroupedCoverage: number) => ({
      ...attempt,
      retryFeedback: { ...feedback, minimumGroupedCoverage },
    });
    expect(projectAgentRuntimeTopicLabelRetryFeedback([], withCoverage(0.5))?.minimumGroupedNodeCount).toBe(0);
    expect(projectAgentRuntimeTopicLabelRetryFeedback(candidates, withCoverage(1))?.minimumGroupedNodeCount).toBe(3);
    expect(projectAgentRuntimeTopicLabelRetryFeedback(candidates, withCoverage(0.34))?.minimumGroupedNodeCount).toBe(2);
    expect(projectAgentRuntimeTopicLabelRetryFeedback(candidates, attempt))
      .toEqual(projectAgentRuntimeTopicLabelRetryFeedback(candidates, attempt));
  });
});
