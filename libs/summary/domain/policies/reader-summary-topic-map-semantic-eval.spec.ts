import type { ReaderSummaryTopicMap } from "../entities/reader-summary-topic-map";
import { evaluateReaderSummaryTopicSemantics } from "./reader-summary-topic-map-semantic-eval";

describe("evaluateReaderSummaryTopicSemantics", () => {
  it("passes grounded merge and split expectations", () => {
    const result = evaluateReaderSummaryTopicSemantics({
      storyClusters: [
        cluster("story:work", "feed:work-1", ["feed:work-2"]),
        cluster("story:benchmark", "feed:benchmark"),
      ],
      topicMap: topicMap([
        node("topic:work", "ChatGPT Work Rollout", ["story:work"]),
        node("topic:benchmark", "GPT-5.6 Sol Benchmark", ["story:benchmark"]),
      ]),
      expectations: [
        expectation("feed:work-1", "work", "work", "release", [
          "chatgpt",
          "work",
        ]),
        expectation("feed:work-2", "work", "work", "release", [
          "chatgpt",
          "work",
        ]),
        expectation("feed:benchmark", "benchmark", "benchmark", "benchmark", [
          "gpt-5.6",
          "sol",
        ]),
      ],
    });

    expect(result).toMatchObject({
      passed: true,
      issues: [],
      metrics: {
        storyCoverage: 1,
        topicCoverage: 1,
        storyPairPrecision: 1,
        storyPairRecall: 1,
        topicPairPrecision: 1,
        topicPairRecall: 1,
        claimAccuracy: 1,
        subjectAccuracy: 1,
      },
    });
  });

  it("reports false merges, false splits, and ungrounded labels", () => {
    const result = evaluateReaderSummaryTopicSemantics({
      storyClusters: [
        cluster("story:merged", "feed:a", ["feed:b"]),
        cluster("story:split-a", "feed:c"),
        cluster("story:split-b", "feed:d"),
      ],
      topicMap: topicMap([
        node("topic:merged", "Generic Topic", ["story:merged"]),
        node("topic:split-a", "Release", ["story:split-a"]),
        node("topic:split-b", "Release", ["story:split-b"]),
      ]),
      expectations: [
        expectation("feed:a", "story-a", "topic-a", "benchmark", ["sol"]),
        expectation("feed:b", "story-b", "topic-b", "release", ["family"]),
        expectation("feed:c", "story-c", "shared-topic", "release", [
          "chatgpt",
        ]),
        expectation("feed:d", "story-d", "shared-topic", "release", [
          "chatgpt",
        ]),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "Story false merges: 1",
        "Topic false merges: 1",
        "Topic false splits: 1",
        "Claim label mismatch for feed item feed:a",
        "Subject label mismatch for feed item feed:a",
      ]),
    );
  });
});

const cluster = (
  id: string,
  representativeFeedItemId: string,
  duplicateFeedItemIds: readonly string[] = [],
) => ({ id, representativeFeedItemId, duplicateFeedItemIds });

const expectation = (
  feedItemId: string,
  expectedStoryKey: string,
  expectedTopicKey: string,
  expectedClaimType: "availability" | "benchmark" | "release",
  expectedSubjectTokens: readonly string[],
) => ({
  feedItemId,
  expectedStoryKey,
  expectedTopicKey,
  expectedClaimType,
  expectedSubjectTokens,
  requiredInTopicMap: true,
});

const node = (
  id: string,
  label: string,
  storyClusterIds: readonly string[],
) => ({
  id,
  label,
  groupId: "group:test",
  storyClusterIds,
  popularityScore: 50,
  sizeWeight: 0.5,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["ai"],
  citationIds: ["citation:1"],
  keywords: [label],
  rationale: "Semantic eval fixture",
});

const topicMap = (
  nodes: readonly ReturnType<typeof node>[],
): ReaderSummaryTopicMap => ({
  schemaVersion: "reader_summary.topic_map.v1",
  generatedBy: "agent-runtime",
  confidence: { level: "high", score: 0.9, rationale: "Fixture" },
  nodes,
  groups: [],
  edges: [],
  warnings: [],
});
