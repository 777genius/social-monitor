import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { buildAgentRuntimeTopicEvidenceSamples } from "./agent-runtime-reader-summary-topic-evidence-samples";

type Candidate = ReaderSummaryTopicLabelerInput["candidates"][number];
type Cluster = ReaderSummaryTopicLabelerInput["clusters"][number];
type Evidence = ReaderSummaryTopicLabelerInput["selectedEvidence"][number];

const candidate = { storyClusterId: "cluster:one" } as Candidate;
const evidence = (feedItemId: string, bodyPreview: string): Evidence => ({
  feedItemId,
  title: `Title ${feedItemId}`,
  providerKey: "rss",
  publishedAt: new Date("2026-07-09T12:00:00.000Z"),
  bodyPreview,
  whyImportant: ["signal", "context", "untrusted-extra"],
} as Evidence);

describe("topic label prompt cluster evidence admission", () => {
  it("deduplicates cluster ids, rejects unrelated evidence and limits projected samples", () => {
    const cluster = {
      representativeFeedItemId: " feed:one ",
      duplicateFeedItemIds: [
        "feed:one", "feed:missing", "feed:two", "feed:three",
        "feed:four", "feed:five",
      ],
    } as Cluster;
    const items = [
      evidence("feed:one", "  First   sentence  with spaces. "),
      evidence("feed:two", "Second"),
      evidence("feed:three", "Third"),
      evidence("feed:four", "Fourth"),
      evidence("feed:five", "Fifth"),
      evidence("feed:unrelated", "Forged from another cluster"),
    ];
    const samples = buildAgentRuntimeTopicEvidenceSamples({
      candidate,
      clusterById: new Map([["cluster:one", cluster]]),
      evidenceByFeedItemId: new Map(items.map((item) => [item.feedItemId, item])),
    });
    expect(samples.map((item) => item.title)).toEqual([
      "Title feed:one", "Title feed:two", "Title feed:three", "Title feed:four",
    ]);
    expect(samples[0]).toMatchObject({
      bodyPreview: "First sentence with spaces.",
      whyImportant: ["signal", "context"],
      providerKey: "rss",
    });
    expect(samples.some((sample) => sample.title === "Title feed:unrelated")).toBe(false);
  });

  it("returns no evidence without the matching cluster, and bounds text to 320 characters", () => {
    const longBody = "X".repeat(400);
    const item = evidence("feed:one", longBody);
    expect(buildAgentRuntimeTopicEvidenceSamples({
      candidate,
      clusterById: new Map(),
      evidenceByFeedItemId: new Map([["feed:one", item]]),
    })).toEqual([]);
    const samples = buildAgentRuntimeTopicEvidenceSamples({
      candidate,
      clusterById: new Map([["cluster:one", {
        representativeFeedItemId: "feed:one",
        duplicateFeedItemIds: [],
      } as Cluster]]),
      evidenceByFeedItemId: new Map([["feed:one", item]]),
    });
    expect(samples).toHaveLength(1);
    expect(samples[0]?.bodyPreview).toEqual(`${"X".repeat(317)}...`);
  });
});
