import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryArtifact, type SummaryEvidenceSelection } from
  "@social-monitor/summary/domain";
import { composeReaderSummaryEditorialSlate } from
  "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate";
import { buildReaderPostPromotionProjection } from
  "@social-monitor/summary/domain/services/reader-post-promotion-projection";
import { artifact as baseArtifact, content, evidenceSelection } from
  "@social-monitor/summary/domain/policies/reader-summary-publication-policy-test-fixtures";
import { serializeReaderSummaryArtifact } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-json";

type Citation = ReturnType<ReaderSummaryArtifact["toSnapshot"]>["citationMap"][number];

// Entirely synthetic. Production slate/projection/attestation builders produce
// the repeated digest material; no padding, provider payloads or raised limits.
export const largeDailyPublicationFixture = (input: Readonly<{
  artifactId?: string;
  tenant?: string;
  workspace?: string;
  day?: string;
  citations?: readonly Citation[];
}> = {}) => {
  const base = baseArtifact().toSnapshot();
  const topicConfidence = { ...base.confidence, level: "medium" as const };
  const seed = evidenceSelection();
  const startedAt = new Date(`${input.day ?? "2026-09-03"}T00:00:00.000Z`);
  const endedAt = new Date(startedAt.getTime() + 86_400_000);
  const observedAt = new Date(startedAt.getTime() + 9 * 3_600_000);
  const publishedAt = new Date(startedAt.getTime() + 8 * 3_600_000);
  const artifactId = input.artifactId ?? fixtureUuid(1, 1);
  const citations = input.citations ?? Array.from({ length: 16 }, (_, i) => ({
    citationId: fixtureUuid(2, i), feedItemId: fixtureUuid(3, i),
    sourceItemId: fixtureUuid(4, i), providerKey: "reddit", field: "title" as const,
    canonicalUrl: `https://example.test/publication/${fixtureUuid(4, i)}`,
  }));
  if (citations.length !== 16 || citations.some((c) => !c.canonicalUrl || c.providerKey !== "reddit")) {
    throw new Error("Fixture requires sixteen Reddit citations with URLs");
  }
  const selectedEvidence = citations.map((citation, i) => ({
    ...seed.selectedEvidence[0]!,
    feedItemId: citation.feedItemId,
    sourceItemId: citation.sourceItemId,
    sourceBindingId: fixtureUuid(5, i),
    canonicalUrl: citation.canonicalUrl!,
    title: `Synthetic study ${i}: ${i < 8 ? "Unicode encoding 東京 🚀" : "Database transactions"} and escaped "quotes"`,
    bodyPreview: i < 8
      ? "Synthetic evidence about Unicode surrogate pairs and scalar boundaries, with newline\n and slash \\"
      : "Synthetic evidence about database serialization conflicts and statement deadlines.",
    publishedAt, observedAt,
    promotionFacts: {
      ...seed.selectedEvidence[0]!.promotionFacts!,
      canonicalIdentity: `url:${citation.canonicalUrl}`,
      metrics: { provider: "reddit" as const, score: 500 - i, upvoteRatio: 0.95 },
      engagementAuthority: {
        observedAt, regressionState: "stable" as const,
      },
      freshnessProvenance: {
        status: "observed" as const, publishedAt, observedAt,
        ingestionCutoff: observedAt,
      },
    },
  }));
  const clusters = selectedEvidence.map((item, i) => ({
    ...seed.clusters[0]!,
    id: `large-daily:${artifactId}:${i}`,
    storyKey: `large-daily-study:${i}`,
    representativeFeedItemId: item.feedItemId,
    observedAtRange: { startedAt: publishedAt, endedAt: observedAt },
  }));
  const sourceWindow = {
    windowId: `large-daily-window:${artifactId}`,
    startedAt, endedAt,
    periodStartedAt: startedAt, periodEndedAt: endedAt,
    ingestionCutoff: observedAt,
    selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
    storyClusterIds: clusters.map((cluster) => cluster.id),
  };
  const selection: SummaryEvidenceSelection = {
    rankingPolicyVersion: seed.rankingPolicyVersion,
    selectedEvidence, clusters, sourceWindow,
  };
  const editorialSlate = composeReaderSummaryEditorialSlate({ selection });
  const promotion = buildReaderPostPromotionProjection({
    evidence: selectedEvidence, clusters, citations, sourceWindow, editorialSlate,
    attestationBinding: { artifactId, sourceWindow },
  });
  const artifact = ReaderSummaryArtifact.create({
    ...base,
    readerSummaryId: artifactId,
    tenantId: tenantId(input.tenant ?? fixtureUuid(6, 1)),
    workspaceId: workspaceId(input.workspace ?? fixtureUuid(7, 1)),
    generatedAt: observedAt,
    period: {
      cadence: "daily", startedAt, endedAt, timezone: "UTC",
      periodKey: `daily:${startedAt.toISOString()}:${endedAt.toISOString()}:UTC`,
    },
    sourceWindow, storyClusters: clusters,
    headline: "Proved report", executiveSummary: "Exact report body.",
    lineage: { ...base.lineage, modelVersion: "codex:gpt-5.6-sol:high",
      promptVersion: "reader-summary.prompt.pg-gate.v1" },
    topStories: clusters.map((cluster, i) => ({
      storyClusterId: cluster.id, title: selectedEvidence[i]!.title,
      summary: selectedEvidence[i]!.bodyPreview!,
      interestIds: cluster.interestIds, providerKeys: cluster.providerKeys,
      citationIds: [citations[i]!.citationId],
    })),
    citationMap: citations,
    content: content({
      headline: "Proved report", oneLineTakeaway: "Exact report body.",
      narrativeSections: [], mainTopics: [],
      topicMap: {
        schemaVersion: "reader_summary.topic_map.v1", generatedBy: "deterministic",
        confidence: topicConfidence,
        groups: [
          { id: "group:unicode-encoding", label: "Unicode encoding", colorKey: "blue",
            semanticAnchors: ["Unicode"], nodeIds: ["unicode-pairs", "unicode-scalars"], confidence: topicConfidence },
          { id: "group:database-transactions", label: "Database transactions", colorKey: "green",
            semanticAnchors: ["Database"], nodeIds: ["database-conflicts", "database-deadlines"], confidence: topicConfidence },
        ],
        nodes: [
          ["unicode-pairs", "Unicode surrogate pairs", "group:unicode-encoding"],
          ["unicode-scalars", "Unicode scalar boundaries", "group:unicode-encoding"],
          ["database-conflicts", "Database serialization conflicts", "group:database-transactions"],
          ["database-deadlines", "Database statement deadlines", "group:database-transactions"],
        ].map(([id, label, groupId], i) => ({
          id: id!, label: label!, groupId: groupId!,
          storyClusterIds: clusters.slice(i * 4, i * 4 + 4).map((cluster) => cluster.id),
          popularityScore: 1, sizeWeight: 1, evidenceCount: 4,
          providerKeys: ["reddit"], interestIds: ["interest-ai"],
          citationIds: citations.slice(i * 4, i * 4 + 4).map((citation) => citation.citationId),
          keywords: label!.split(" "), rationale: "Synthetic runtime study evidence.",
        })),
        edges: [], warnings: [],
      },
      topReads: promotion.topReads,
      selectedPosts: promotion.additionalPosts,
      sourceMix: [{ providerKey: "reddit", itemCount: 16, citationCount: 16,
        storyClusterCount: 16, crossSourceClusterCount: 0,
        singleSourceOnly: true, interestIds: ["interest-ai"] }],
    }),
    promotionAttestations: promotion.attestations,
    promotionEvidenceFacts: promotion.attestedEvidenceFacts,
  });
  const payload = serializeReaderSummaryArtifact(artifact);
  return { artifact, payload, citations, evidence: selectedEvidence };
};

const fixtureUuid = (family: number, index: number): string =>
  `${String(family).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;

export const dailyPublicationReport = (
  artifactPayload: Readonly<Record<string, unknown>>,
  qualitySignals: unknown = {},
) => ({
  schemaVersion: "reader_summary.publication_report.v1",
  semanticStatus: "COMPLETED",
  modelVersion: (artifactPayload.lineage as Record<string, unknown>).modelVersion,
  promptVersion: (artifactPayload.lineage as Record<string, unknown>).promptVersion,
  headline: artifactPayload.headline, summaryText: artifactPayload.executiveSummary,
  artifactPayload, citations: artifactPayload.citationMap, qualitySignals,
});

export const jsonStructure = (value: unknown) => {
  const result = { nodes: 0, depth: 0, keys: 0, objectKeys: 0,
    arrayElements: 0, maxArray: 0, maxString: 0 };
  const visit = (node: unknown, depth: number): void => {
    result.nodes += 1;
    result.depth = Math.max(result.depth, depth);
    if (typeof node === "string") result.maxString = Math.max(result.maxString, node.length);
    if (Array.isArray(node)) {
      result.arrayElements += node.length;
      result.maxArray = Math.max(result.maxArray, node.length);
      node.forEach((child) => visit(child, depth + 1));
    } else if (node !== null && typeof node === "object") {
      const keys = Object.keys(node);
      result.keys += keys.length;
      result.objectKeys = Math.max(result.objectKeys, keys.length);
      Object.values(node).forEach((child) => visit(child, depth + 1));
    }
  };
  visit(value, 0);
  return result;
};
