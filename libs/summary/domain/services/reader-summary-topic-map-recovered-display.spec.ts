import type { BuildReaderSummaryTopicMapParams, ReaderSummaryTopicGroupLabel } from "./reader-summary-topic-label-plan";
import { buildReaderSummaryTopicMap } from "./reader-summary-topic-map-builder";
import { buildReaderSummaryTopicMapGroups } from "./reader-summary-topic-map-structure";

describe("recovered group display validation", () => {
  it.each(["RSS", "", " \t ", "Source Feed", "Topic Map"])("retains a usable recovered display when the primary is %j", (label) => {
    const map = buildReaderSummaryTopicMap(displayFixture({ label }));
    expect(map.groups).toHaveLength(1);
    expect(map.groups[0]).toMatchObject({
      id: "group:xai", label: "Xai", confidence: { level: "high", score: 0.95 },
    });
    expect(map.nodes).toHaveLength(2);
    expect(map.nodes.every((node) => node.groupId === "group:xai")).toBe(true);
  });

  it.each([undefined, "RSS", "Source Feed", "", "Orion", "Xai Phantom", "Copper"])("does not render unusable, ungrounded or misaligned recovery %j", (recoveredDisplayLabel) => {
    const map = buildReaderSummaryTopicMap(displayFixture({ label: "RSS", recoveredDisplayLabel }));
    expect(map.groups[0]?.label).toBe("xAI");
  });

  it("checks the recovered provider label even when the primary passes initial validation", () => {
    const fixture = displayFixture({ label: "Orion" });
    const map = buildReaderSummaryTopicMap({
      ...fixture,
      selectedEvidence: fixture.selectedEvidence.map((item) => ({ ...item, providerName: "Xai" })),
    });
    expect(map.groups[0]?.label).toBe("xAI");
  });

  it("does not borrow a recovered display from a different group definition", () => {
    const map = buildReaderSummaryTopicMap(displayFixture({ id: "group:orion", label: "RSS" }));
    expect(map.groups[0]).toMatchObject({ id: "group:xai", label: "xAI" });
  });

  it("tries recovery when rendering an empty primary directly", () => {
    const fixture = displayFixture({ label: "" });
    const nodes = buildReaderSummaryTopicMap(fixture).nodes;
    const group = fixture.labelPlan!.groups[0]!;
    expect(buildReaderSummaryTopicMapGroups(nodes, new Map([[group.id, group]]))[0]?.label).toBe("Xai");
  });

  it("keeps the ungrouped display despite an otherwise usable recovery", () => {
    const nodes = buildReaderSummaryTopicMap(displayFixture({})).nodes.map((node) => ({ ...node, groupId: "group:ungrouped" }));
    const group = { id: "group:ungrouped", label: "", recoveredDisplayLabel: "Xai" };
    expect(buildReaderSummaryTopicMapGroups(nodes, new Map([[group.id, group]]))[0]?.label).toBe("Ungrouped");
  });
});

const displayFixture = (overrides: Partial<ReaderSummaryTopicGroupLabel>): BuildReaderSummaryTopicMapParams => {
  const stamp = new Date("2026-09-06T00:00:00.000Z");
  const subjects = ["Beacon", "Harbor"];
  const nodeLabels = subjects.map((subject, index) => ({
    nodeId: `topic:story:${index}`, topicId: `topic:${subject.toLowerCase()}`,
    label: subject, groupId: "group:xai", originalGroupId: "group:xai",
    semantic: { subject, claimType: "other" as const, confidenceScore: 0.95 },
    keywords: ["Xai", "Copper"],
  }));
  return {
    generatedBy: "agent-runtime", topStories: [], citationMap: [],
    clusters: subjects.map((_, index) => ({
      id: `story:${index}`, storyKey: `story-${index}`, rankingPolicyVersion: "story_ranking_v10",
      representativeFeedItemId: `feed-${index}`, duplicateFeedItemIds: [], interestIds: ["test-interest"],
      providerKeys: ["rss"], score: 1 - index / 100,
      observedAtRange: { startedAt: stamp, endedAt: stamp }, whyImportant: [],
    })),
    selectedEvidence: subjects.map((subject, index) => ({
      feedItemId: `feed-${index}`, sourceItemId: `source-${index}`, sourceBindingId: "test-binding",
      interestId: "test-interest", providerKey: "rss", providerName: "Source Feed",
      title: `xAI ${subject}`, bodyPreview: `xAI ${subject}. Copper.`,
      canonicalUrl: `https://example.test/${index}`, publishedAt: stamp, observedAt: stamp,
      score: 1 - index / 100, whyImportant: [],
    })),
    labelPlan: {
      nodeLabels,
      groups: [{
        id: "group:xai", label: "Xai", recoveredDisplayLabel: "Xai", semanticAnchors: ["xAI"],
        nodeIds: nodeLabels.map((node) => node.nodeId), confidenceScore: 0.95, ...overrides,
      }],
    },
  };
};
