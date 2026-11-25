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

  it("skips missing optional rows but still blocks missing required rows", () => {
    const optionalOnly = evaluateReaderSummaryTopicSemantics({
      storyClusters: [],
      topicMap: topicMap([]),
      expectations: [
        {
          feedItemId: "feed:optional",
          expectedStoryKey: "optional",
          requiredInTopicMap: false,
        },
      ],
    });
    const required = evaluateReaderSummaryTopicSemantics({
      storyClusters: [],
      topicMap: topicMap([]),
      expectations: [
        expectation("feed:required", "required", "required", "release", [
          "product",
        ]),
      ],
    });

    expect(optionalOnly).toMatchObject({
      passed: true,
      issues: [],
      metrics: {
        evaluatedExpectationCount: 0,
        skippedOptionalCount: 1,
      },
    });
    expect(required.issues).toEqual([
      "Missing story cluster for feed item feed:required",
      "Missing required topic node for feed item feed:required",
    ]);
    expect(required.metrics).toMatchObject({
      claimAccuracy: 0,
      subjectAccuracy: 0,
    });
  });

  it("evaluates optional semantic expectations when their topic is present", () => {
    const result = evaluateReaderSummaryTopicSemantics({
      storyClusters: [cluster("story:optional", "feed:optional")],
      topicMap: topicMap([
        node("topic:optional", "GPT-5 Models Benchmark", ["story:optional"]),
      ]),
      expectations: [
        {
          feedItemId: "feed:optional",
          expectedStoryKey: "optional",
          expectedTopicKey: "optional",
          expectedClaimType: "comparison",
          expectedSubjectTokens: ["gpt-5"],
          requiredInTopicMap: false,
        },
      ],
    });

    expect(result).toMatchObject({
      passed: false,
      metrics: {
        evaluatedExpectationCount: 1,
        skippedOptionalCount: 0,
        claimAccuracy: 0,
        subjectAccuracy: 1,
      },
      issues: ["Claim label mismatch for feed item feed:optional"],
    });
  });

  it("accepts reviewed multi-label claim ambiguity", () => {
    const result = evaluateReaderSummaryTopicSemantics({
      storyClusters: [cluster("story:comparison", "feed:comparison")],
      topicMap: topicMap([
        node("topic:comparison", "GPT-5 Sol Comparison", ["story:comparison"]),
      ]),
      expectations: [
        {
          feedItemId: "feed:comparison",
          expectedStoryKey: "comparison",
          expectedTopicKey: "comparison",
          acceptableClaimTypes: ["benchmark", "comparison"],
          expectedSubjectTokens: ["gpt-5", "sol"],
          requiredInTopicMap: true,
        },
      ],
    });

    expect(result).toMatchObject({
      passed: true,
      metrics: { claimAccuracy: 1 },
      issues: [],
    });
  });

  it("rejects reviewed reader-facing fragment tokens", () => {
    const result = evaluateReaderSummaryTopicSemantics({
      storyClusters: [cluster("story:commentary", "feed:commentary")],
      topicMap: topicMap([
        node("topic:commentary", "ChatGPT Confused Comparison", [
          "story:commentary",
        ]),
      ]),
      expectations: [
        {
          feedItemId: "feed:commentary",
          expectedStoryKey: "commentary",
          expectedTopicKey: "commentary",
          expectedClaimType: "comparison",
          expectedSubjectTokens: ["chatgpt"],
          forbiddenLabelTokens: ["confused"],
          requiredInTopicMap: true,
        },
      ],
    });

    expect(result).toMatchObject({
      passed: false,
      metrics: { labelQualityAccuracy: 0 },
      issues: ["Forbidden label token for feed item feed:commentary"],
    });
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
