import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { readCompleteTopicNodeLabels } from "./agent-runtime-reader-summary-topic-untrusted-response";
import { projectInitialTopicGroupAssignments } from "./agent-runtime-reader-summary-topic-group-policy";

describe("topic group admission before grounded cohort recovery", () => {
  const candidates: ReaderSummaryTopicLabelerInput["candidates"] = [
    "a", "b", "c",
  ].map((id, index) => ({
    nodeId: `topic:story:${id}`,
    storyClusterId: `story:${id}`,
    fallbackLabel: `Topic ${id}`,
    score: 90 - index,
    evidenceCount: 1,
    providerKeys: ["synthetic"],
    interestIds: [],
    keywords: [id],
    labelCandidates: [],
  }));

  it("retains only supported, confident memberships and original identities", () => {
    const parsed = readCompleteTopicNodeLabels(
      candidates.map((candidate, index) => ({
        nodeId: candidate.nodeId,
        subject: candidate.fallbackLabel,
        claimType: "other",
        confidenceScore: index === 1 ? 0.1 : 0.95,
        groupId: index === 2 ? "group:single" : "group:shared",
      })),
      candidates,
    );
    const admitted = projectInitialTopicGroupAssignments(parsed, candidates);
    expect(admitted.map((label) => ({
      groupId: label.groupId,
      originalGroupId: label.originalGroupId,
    }))).toEqual([
      { groupId: "group:shared", originalGroupId: "group:shared" },
      { groupId: "group:ungrouped", originalGroupId: "group:shared" },
      { groupId: "group:ungrouped", originalGroupId: "group:single" },
    ]);
    expect(admitted.map((label) => label.nodeId)).toEqual(candidates.map((c) => c.nodeId));
    expect(parsed[1]?.rawGroupId).toBe("group:shared");
  });

  it("cannot promote invalid group identities or singleton groups", () => {
    const parsed = readCompleteTopicNodeLabels(
      candidates.map((candidate, index) => ({
        nodeId: candidate.nodeId,
        subject: candidate.fallbackLabel,
        confidenceScore: 1,
        groupId: index === 1 ? "group:valid" : "topic:not-a-group",
      })),
      candidates,
    );
    const admitted = projectInitialTopicGroupAssignments(parsed, candidates);
    expect(admitted.map((label) => label.groupId))
      .toEqual(["group:ungrouped", "group:ungrouped", "group:ungrouped"]);
    expect(admitted.map((label) => label.originalGroupId))
      .toEqual(["group:ungrouped", "group:valid", "group:ungrouped"]);
  });
});
