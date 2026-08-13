import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { selectAgentRuntimeReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-labeler-prompt";

describe("buildTopicCandidateRelationshipHints", () => {
  it("selects candidates by deterministic story score", () => {
    const highPopularity = candidate("node:popular", ["Popular Topic"]);
    const highStoryScore = candidate("node:grounded", ["Grounded Topic"]);
    const input = {
      candidates: [
        { ...highPopularity, score: 100 },
        { ...highStoryScore, score: 10 },
      ],
      clusters: [
        storyCluster(highPopularity.storyClusterId, 1),
        storyCluster(highStoryScore.storyClusterId, 2),
      ],
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(selectAgentRuntimeReaderSummaryTopicCandidates(input, 1)).toEqual([
      expect.objectContaining({ nodeId: "node:grounded" }),
    ]);
  });

  it("preserves the leading stories and completes grounded cohorts", () => {
    const candidates = [
      candidate("node:top-1", ["Flutter"]),
      candidate("node:top-2", ["Grok"]),
      candidate("node:claude-lead", ["Claude"]),
      candidate("node:top-4", ["Maths"]),
      candidate("node:rust-lead", ["Postgres", "Rust"]),
      candidate("node:top-6", ["WebSockets"]),
      candidate("node:gemini-lead", ["Pixel", "Gemini"]),
      candidate("node:top-8", ["EMS"]),
      candidate("node:top-9", ["AmigaDOS"]),
      candidate("node:rust-peer", ["Woxi", "Rust"]),
      candidate("node:top-11", ["Qwen"]),
      candidate("node:gemini-peer", ["Gemini"]),
      candidate("node:top-13", ["Medical"]),
      candidate("node:top-14", ["Founders"]),
      candidate("node:top-15", ["GitHub"]),
      candidate("node:top-16", ["OpenAI"]),
      candidate("node:claude-peer", ["Claude"]),
      candidate("node:top-18", ["Research"]),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    const selected = selectAgentRuntimeReaderSummaryTopicCandidates(input, 10);

    expect(selected.slice(0, 5).map((item) => item.nodeId)).toEqual([
      "node:top-1",
      "node:top-2",
      "node:claude-lead",
      "node:top-4",
      "node:rust-lead",
    ]);
    expect(selected.map((item) => item.nodeId)).toEqual(
      expect.arrayContaining([
        "node:claude-peer",
        "node:rust-peer",
        "node:gemini-lead",
        "node:gemini-peer",
      ]),
    );
    expect(selected).toHaveLength(10);
  });

  it("adds grounded cohorts atomically before filling by rank", () => {
    const candidates = [
      candidate("node:top-1", ["Alpha"]),
      candidate("node:top-2", ["Beta"]),
      candidate("node:top-3", ["Gamma"]),
      candidate("node:unrelated-1", ["Medical"]),
      candidate("node:unrelated-2", ["Business"]),
      candidate("node:claude-1", ["Claude"]),
      candidate("node:claude-2", ["Claude"]),
      candidate("node:rust-1", ["Rust"]),
      candidate("node:rust-2", ["Rust"]),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(
      selectAgentRuntimeReaderSummaryTopicCandidates(input, 8).map(
        (item) => item.nodeId,
      ),
    ).toEqual([
      "node:top-1",
      "node:top-2",
      "node:top-3",
      "node:unrelated-1",
      "node:claude-1",
      "node:claude-2",
      "node:rust-1",
      "node:rust-2",
    ]);
  });

  it("does not start an unsupported cohort with the final slot", () => {
    const candidates = [
      candidate("node:top-1", ["Alpha"]),
      candidate("node:top-2", ["Beta"]),
      candidate("node:top-3", ["Gamma"]),
      candidate("node:filler", ["Medical"]),
      candidate("node:claude-1", ["Claude"]),
      candidate("node:claude-2", ["Claude"]),
      candidate("node:rust-1", ["Rust"]),
      candidate("node:rust-2", ["Rust"]),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(
      selectAgentRuntimeReaderSummaryTopicCandidates(input, 6).map(
        (item) => item.nodeId,
      ),
    ).toEqual([
      "node:top-1",
      "node:top-2",
      "node:top-3",
      "node:filler",
      "node:claude-1",
      "node:claude-2",
    ]);
  });
});

const candidate = (
  nodeId: string,
  keywords: readonly string[],
): ReaderSummaryTopicLabelCandidate => ({
  nodeId,
  storyClusterId: `story:${nodeId}`,
  fallbackLabel: keywords[0] ?? nodeId,
  score: 1,
  evidenceCount: 1,
  providerKeys: ["x-twitter"],
  interestIds: ["interest:ai"],
  keywords,
  labelCandidates: [],
});

const storyCluster = (id: string, score: number) => ({
  id,
  storyKey: id,
  representativeFeedItemId: `feed:${id}`,
  duplicateFeedItemIds: [],
  interestIds: ["interest:ai"],
  providerKeys: ["x-twitter"],
  score,
  observedAtRange: {
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-09T00:00:00.000Z"),
  },
  whyImportant: ["Fixture"],
});
