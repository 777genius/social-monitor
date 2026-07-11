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
