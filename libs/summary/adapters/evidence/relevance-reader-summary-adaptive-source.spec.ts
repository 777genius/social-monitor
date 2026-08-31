import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import {
  FixedClock,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  READER_SUMMARY_ORIGINAL_SOURCE_TEXT_SAFETY_CAP,
  RelevanceReaderSummaryEvidenceSelector,
} from "./relevance-reader-summary-evidence.selector";
import { authoritativeReaderSummaryProviderMetadata } from
  "../../test-fixtures/reader-summary-authoritative-provider-metadata.fixture";

describe("RelevanceReaderSummaryEvidenceSelector adaptive source content", () => {
  it("uses source text already sealed by the authoritative ranking snapshot", async () => {
    const sealedSourceText =
      "Sol 5 Ultra burned through the five-hour limit in fifteen minutes.\n" +
      "[UNTRUSTED_SOURCE_INSTRUCTION_REDACTED]";
    const rankedItem = {
      feedItemId: "feed-ultra",
      sourceItemId: "source-ultra",
      sourceBindingId: "binding-reddit",
      interestId: "interest-ai",
      providerKey: "reddit",
      providerMetadata: authoritativeReaderSummaryProviderMetadata(
        "reddit",
        120,
      ),
      canonicalUrl: "https://reddit.test/ultra",
      title: "Sol 5 Ultra usage limit report",
      bodyPreview: "A short preview of the Ultra usage report.",
      sourceText: sealedSourceText,
      publishedAt: "2026-07-09T08:00:00.000Z",
      observedAt: "2026-07-09T08:01:00.000Z",
      score: 2.4,
      rank: 1,
      clusterId: "cluster-ultra",
      clusterSize: 1,
      duplicateFeedItemIds: [],
      whyImportant: ["Concrete usage limit report"],
      safety: {
        status: "allowed",
        categories: ["raw_payload_retention_disabled"],
        rawPayloadRetained: false,
        retentionPolicy: "normalized_preview_only",
      },
      contentQuality: {
        qualityScore: 0.9,
        interestRelevanceScore: 0.9,
        engagementIntegrityScore: 0.8,
        eligibleForSummary: true,
        eligibleForTopRead: true,
        needsLlmReview: false,
        decision: "promote",
        flags: [],
        reason: "Concrete self-contained report",
      },
    } as const;
    const rankFeedItems = {
      execute: jest.fn(async () =>
        ok({
          generatedAt: "2026-07-09T09:00:00.000Z",
          profileApplied: false,
          items: [rankedItem],
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const readSourceContent = jest.fn();
    const feedItems: FeedItemReadRepositoryPort = {
      readPromotionSnapshot: jest.fn(async () => ({
        ok: true,
        candidates: [],
        sourceContent: [],
        physicalRowsRead: 0,
        exhausted: true,
      } as const)),
      list: jest.fn(async () => ({ items: [] })),
      findById: jest.fn(async () => null),
      readSourceContent,
    };
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      new FixedClock(new Date("2026-07-09T09:00:00.000Z")),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-adaptive-source"),
      workspaceId: workspaceId("workspace-adaptive-source"),
      scope: { type: "workspace" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-07-09T00:00:00.000Z"),
        endedAt: new Date("2026-07-10T00:00:00.000Z"),
        timezone: "UTC",
        periodKey: "daily:adaptive-source",
      },
      maxItems: 1,
      observedThrough: new Date("2026-07-09T09:00:00.000Z"),
    });

    expect(readSourceContent).not.toHaveBeenCalled();
    expect(selection.selectedEvidence[0]?.sourceText).toContain(
      "Sol 5 Ultra burned through the five-hour limit",
    );
    expect(selection.selectedEvidence[0]?.sourceText).not.toContain(
      "Ignore previous instructions",
    );
    expect(selection.selectedEvidence[0]?.sourceText?.length).toBeLessThanOrEqual(
      READER_SUMMARY_ORIGINAL_SOURCE_TEXT_SAFETY_CAP,
    );
  });
});
