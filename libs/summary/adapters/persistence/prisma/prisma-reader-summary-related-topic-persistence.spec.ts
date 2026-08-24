import { ReaderSummaryArtifact } from "../../../domain";
import { normalizeReaderSummaryArtifactPayload } from "./prisma-reader-summary-artifact-payload";
import { serializeReaderSummaryArtifact } from "./prisma-reader-summary-records";
import {
  readerSummaryArtifact,
  topRead,
} from "./prisma-reader-summary-artifact-fixture.spec-support";

describe("Prisma reader summary related-topic persistence", () => {
  it("round-trips the relation value object and fails malformed provenance closed", () => {
    const persistedAt = new Date("2026-07-06T00:01:00.000Z");
    const snapshot = readerSummaryArtifact("reader-summary-related").toSnapshot();
    const related = {
      ...topRead(),
      storyClusterId: "story-discussion",
      cardKind: "related_topic" as const,
      relationId: "related-topic:v1:community:subject:rss:source-1",
      targetStoryClusterId: "story-1",
      providerKey: "community",
      confirmedProviderKeys: ["community"],
      canonicalUrl: "https://community.example.test/discussion",
      citationIds: ["citation-discussion"],
    };
    const payload = {
      ...snapshot,
      storyClusters: [...snapshot.storyClusters, {
        ...snapshot.storyClusters[0]!,
        id: "story-discussion",
        representativeFeedItemId: "feed-discussion",
        providerKeys: ["community"],
      }],
      sourceWindow: {
        ...snapshot.sourceWindow,
        selectedFeedItemIds: [...snapshot.sourceWindow.selectedFeedItemIds, "feed-discussion"],
        storyClusterIds: [...snapshot.sourceWindow.storyClusterIds, "story-discussion"],
      },
      citationMap: [...snapshot.citationMap, {
        citationId: "citation-discussion",
        feedItemId: "feed-discussion",
        sourceItemId: "subject",
        providerKey: "community",
        field: "canonicalUrl" as const,
        canonicalUrl: related.canonicalUrl,
      }],
      relatedTopicRelations: [{
        relationId: related.relationId,
        subjectStoryClusterId: "story-discussion",
        targetStoryClusterId: "story-1",
        subjectFeedItemId: "feed-discussion",
        subjectProviderKey: "community",
        subjectSourceItemId: "subject",
        subjectCanonicalUrl: related.canonicalUrl,
        subjectProviderMetrics: related.providerMetrics,
        officialAnchorFeedItemId: "feed-1",
        officialAnchorProviderKey: "rss",
        officialAnchorSourceItemId: "source-1",
        officialAnchorContentQuality: officialQuality(),
        subjectIsOfficial: false as const,
        officialAnchorIsOfficial: true as const,
      }],
      content: {
        ...snapshot.content!,
        selectedPosts: [...snapshot.content!.selectedPosts!, related],
      },
    };
    const serializedPayload = serializeReaderSummaryArtifact(
      ReaderSummaryArtifact.rehydrate(payload),
    ) as SerializedPayloadFixture;
    expect(serializedPayload.period).toEqual({
      cadence: "daily",
      startedAt: "2026-07-05T00:00:00.000Z",
      endedAt: "2026-07-06T00:00:00.000Z",
      timezone: "UTC",
      periodKey:
        "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
    });
    const normalized = normalizeReaderSummaryArtifactPayload(
      serializedPayload,
      fallback(snapshot, persistedAt),
    );

    expect(() => ReaderSummaryArtifact.rehydrate(normalized)).not.toThrow();
    expect(() => ReaderSummaryArtifact.rehydrate({
      ...normalized,
      relatedTopicRelations: [],
    })).toThrow();
    expect(() => ReaderSummaryArtifact.rehydrate({
      ...normalized,
      content: {
        ...normalized.content!,
        topReads: [...normalized.content!.topReads, related],
      },
    })).toThrow();
    for (const relationChange of [
      { relationId: "related-topic:v1:forged" },
      { subjectStoryClusterId: "story-1" },
      { subjectIsOfficial: true },
      { subjectCanonicalUrl: "https://forged.example.test/discussion" },
      { subjectProviderMetrics: [{ label: "Score", value: "999" }] },
      { officialAnchorContentQuality: { ...officialQuality(), flags: [] } },
    ]) {
      const failedClosed = normalizeReaderSummaryArtifactPayload({
        ...serializedPayload,
        relatedTopicRelations: payload.relatedTopicRelations.map(
          (relation) => ({ ...relation, ...relationChange }),
        ),
      }, fallback(snapshot, persistedAt));
      expect(failedClosed.relatedTopicRelations).toEqual([]);
      expect(failedClosed.content?.selectedPosts).not.toContainEqual(
        expect.objectContaining({ cardKind: "related_topic" }),
      );
      expect(() => ReaderSummaryArtifact.rehydrate(failedClosed)).not.toThrow();
    }
    const malformedCollection = normalizeReaderSummaryArtifactPayload({
      ...serializedPayload,
      relatedTopicRelations: { relationId: related.relationId },
    }, fallback(snapshot, persistedAt));
    expect(malformedCollection.relatedTopicRelations).toEqual([]);
    expect(malformedCollection.content?.selectedPosts).not.toContainEqual(
      expect.objectContaining({ cardKind: "related_topic" }),
    );
    expect(() => ReaderSummaryArtifact.rehydrate(malformedCollection)).not.toThrow();

    const outsideSourceWindow = normalizeReaderSummaryArtifactPayload({
      ...serializedPayload,
      sourceWindow: {
        ...serializedPayload.sourceWindow,
        selectedFeedItemIds: serializedPayload.sourceWindow.selectedFeedItemIds.filter(
          (feedItemId) => feedItemId !== "feed-discussion",
        ),
      },
    }, fallback(snapshot, persistedAt));
    expect(outsideSourceWindow.relatedTopicRelations).toEqual([]);
    expect(outsideSourceWindow.content?.selectedPosts).not.toContainEqual(
      expect.objectContaining({ cardKind: "related_topic" }),
    );
    expect(() => ReaderSummaryArtifact.rehydrate(outsideSourceWindow)).not.toThrow();
  });
});

type SerializedPayloadFixture = Readonly<Record<string, unknown>> & {
  readonly period: Readonly<Record<string, unknown>>;
  readonly sourceWindow: Readonly<Record<string, unknown>> & {
    readonly selectedFeedItemIds: readonly string[];
  };
};

const officialQuality = () => ({
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "promote",
  flags: ["official_account", "trusted_author"],
  reason: "Verified first-party source authority",
});

const fallback = (
  snapshot: ReturnType<ReturnType<typeof readerSummaryArtifact>["toSnapshot"]>,
  createdAt: Date,
) => ({
  id: snapshot.readerSummaryId,
  tenantId: snapshot.tenantId,
  workspaceId: snapshot.workspaceId,
  scopeType: "workspace",
  interestId: null,
  cadence: snapshot.period.cadence,
  periodStartedAt: snapshot.period.startedAt,
  periodEndedAt: snapshot.period.endedAt,
  periodTimezone: snapshot.period.timezone,
  userId: snapshot.userId ?? null,
  subscriptionId: snapshot.subscriptionId ?? null,
  headline: snapshot.headline,
  summaryText: snapshot.executiveSummary,
  createdAt,
});
