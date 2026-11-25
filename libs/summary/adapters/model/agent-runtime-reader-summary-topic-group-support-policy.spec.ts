import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import {
  retainedSemanticGroupIds as legacyRetainedGroups,
} from "./agent-runtime-reader-summary-topic-group-policy";
import {
  retainedSemanticGroupIds,
} from "./agent-runtime-reader-summary-topic-group-support-policy";

const candidate = (
  nodeId: string,
  score: number,
): ReaderSummaryTopicLabelerInput["candidates"][number] => ({
  nodeId,
  storyClusterId: `story:${nodeId}`,
  fallbackLabel: nodeId,
  score,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["topic"],
  keywords: [],
  labelCandidates: [],
});

describe("candidate-grounded semantic group ranking", () => {
  it("preserves the existing re-export and deterministic support/rank order", () => {
    expect(legacyRetainedGroups).toBe(retainedSemanticGroupIds);
    const candidates = [
      candidate("n1", 10), candidate("n2", 20),
      candidate("n3", 5), candidate("n4", 15),
      candidate("n5", 20), candidate("n6", 10),
    ];
    const labels = [
      { nodeId: "n1", groupId: "group:b" },
      { nodeId: "n2", groupId: "group:b" },
      { nodeId: "n3", groupId: "group:a" },
      { nodeId: "n4", groupId: "group:a" },
      { nodeId: "n5", groupId: "group:c" },
      { nodeId: "n6", groupId: "group:c" },
    ];
    expect([...retainedSemanticGroupIds(labels, candidates)]).toEqual([
      "group:b", "group:c", "group:a",
    ]);
  });

  it("does not promote duplicate or unknown node IDs into a two-node group", () => {
    const candidates = [candidate("n1", 90), candidate("n2", 30)];
    expect([...retainedSemanticGroupIds([
      { nodeId: "n1", groupId: "group:forged" },
      { nodeId: "n1", groupId: "group:forged" },
      { nodeId: "unrequested", groupId: "group:forged" },
    ], candidates)]).toEqual([]);
    expect([...retainedSemanticGroupIds([
      { nodeId: "n1", groupId: "group:ungrouped" },
      { nodeId: "n1", groupId: "group:admitted" },
      { nodeId: "n2", groupId: "group:admitted" },
    ], candidates)]).toEqual([]);
    expect([...retainedSemanticGroupIds([
      { nodeId: "n1", groupId: "group:admitted" },
      { nodeId: "n2", groupId: "group:admitted" },
    ], candidates)]).toEqual(["group:admitted"]);
  });
});
