import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { BuildReaderSummaryTopicMapCommand } from "../../features/build-reader-summary-topic-map/build-reader-summary-topic-map.command";

/** Exact synthetic reviewer inputs for R1/R2; no live runtime or incident claim. */
export const reviewPublicationFixture = (kind: "conflict" | "xai" | "complete" | "low-confidence") => {
  const xai = kind === "xai";
  const subjects = xai ? ["Beacon", "Harbor"] : [
    "Orion Beacon", "Orion Harbor", "Orion Quartz", "Orion Nimbus", "Redwood", "Cobalt", "Juniper", "Saffron",
  ];
  const keywords = ["Copper", "Silver", "Zinc", "Tin", "Nickel", "Cobalt", "Iron", "Oak"];
  const stamp = new Date("2026-09-06T00:00:00.000Z");
  const selectedEvidence = subjects.map((subject, index) => ({
    feedItemId: `review-feed-${index}`, sourceItemId: `review-source-${index}`,
    sourceBindingId: "review-binding", interestId: "review-interest", providerKey: "rss",
    title: xai ? `xAI ${subject}` : subject,
    bodyPreview: `${xai ? `xAI ${subject}` : subject}. ${keywords.join(" ")}.`,
    canonicalUrl: `https://example.test/review-${index}`, publishedAt: stamp, observedAt: stamp,
    score: 1 - index / 100, whyImportant: [],
    contentQuality: {
      score: 0.95, interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
      eligibleForSummary: true, eligibleForTopRead: true, needsLlmReview: false,
      decision: "keep" as const, flags: [], reason: "Synthetic review evidence",
    },
  }));
  const input = {
    tenantId: tenantId("test-review-tenant"), workspaceId: workspaceId("test-review-workspace"),
    scope: { type: "workspace" }, requestedAt: stamp,
    period: { cadence: "daily", startedAt: new Date("2026-09-05T00:00:00.000Z"), endedAt: stamp, timezone: "UTC", periodKey: "test-review-period" },
    clusters: subjects.map((_, index) => ({
      id: `story:review-${index}`, storyKey: `review-${index}`, rankingPolicyVersion: "story_ranking_v10",
      representativeFeedItemId: selectedEvidence[index]!.feedItemId, duplicateFeedItemIds: [],
      interestIds: ["review-interest"], providerKeys: ["rss"], score: 1 - index / 100,
      observedAtRange: { startedAt: stamp, endedAt: stamp }, whyImportant: [],
    })),
    selectedEvidence, topStories: [],
    citationMap: selectedEvidence.map((item, index) => ({
      citationId: `review-c${index}`, feedItemId: item.feedItemId, sourceItemId: item.sourceItemId,
      providerKey: "rss", field: "bodyPreview", canonicalUrl: item.canonicalUrl,
    })),
  };
  const nodeLabels = subjects.map((subject, index) => ({
    nodeId: `topic:story:review-${index}`, topicId: `topic:${subject.toLowerCase().replaceAll(" ", "-")}`,
    subject, parentSubject: "", claimType: "other", keywords: [...keywords],
    confidenceScore: kind === "low-confidence" && index === 3 ? 0.2 : 0.95,
    groupId: xai ? "group:xai" : kind === "conflict" && index === 2 ? "group:quartz"
      : index < 3 ? "group:orion" : "group:ungrouped",
  }));
  const groups = [...new Set(nodeLabels.map((label) => label.groupId))]
    .filter((id) => id !== "group:ungrouped").map((id) => ({
      id, label: xai ? "xAI" : id.slice(6, 7).toUpperCase() + id.slice(7),
      semanticAnchors: [xai ? "xAI" : id.slice(6)], confidenceScore: 0.95,
      nodeIds: nodeLabels.filter((label) => label.groupId === id).map((label) => label.nodeId),
    }));
  // Replay the reviewer's runtime input exactly, including legacy contentQuality.score
  // in place of qualityScore. This assertion is confined to the synthetic boundary.
  return { input: input as unknown as BuildReaderSummaryTopicMapCommand, raw: { nodeLabels, groups } };
};
