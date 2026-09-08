import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { FeedItem, classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import type { ConfiguredInterestReaderPort } from "@social-monitor/relevance/ports";
import { createReaderSummaryDailyPublicationExecutionWiring } from "./reader-summary-daily-publication-finalizer";
import { preflightRefreshSelection, refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { refreshScope } from "./reader-summary-new-input-refresh-manifest";

const clock = new FixedClock(new Date("2026-09-04T00:00:00Z"));
const scope = { tenantId: tenantId(refreshScope.tenantId), workspaceId: workspaceId(refreshScope.workspaceId) };
const item = FeedItem.rehydrate({ ...scope, id: "synthetic-feed", sourceItemId: "synthetic-source",
  interestId: "synthetic-interest", sourceBindingId: "synthetic-binding", providerKey: "hacker-news",
  canonicalUrl: "https://example.test/bread", title: "Local bakers share their best bread recipes with neighbors",
  bodyPreview: "", publishedAt: new Date("2026-09-03T12:00:00Z"), observedAt: new Date("2026-09-03T12:00:00Z"),
  providerMetadata: { kind: "hacker_news_story", points: 338, interestQuerySnapshot: { query: "best" } },
});
const feed = { list: async () => ({ items: [] }), findById: async () => null,
  readPromotionSnapshot: async () => {
    const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
    if (!canonical.eligible) throw new Error("Invalid fixture");
    return { ok: true as const, exhausted: true as const, physicalRowsRead: 1,
      candidates: [{ item, canonical, metricAuthority: { observedAt: new Date("2026-09-04T00:00:00Z"), regressionState: "stable" as const } }],
      sourceContent: [{ feedItemId: "synthetic-feed", sourceItemId: "synthetic-source", body: "" }] };
  } };
const reader = (query: string) => ({ readCurrent: jest.fn<ReturnType<ConfiguredInterestReaderPort["readCurrent"]>,
  Parameters<ConfiguredInterestReaderPort["readCurrent"]>>(async (scope) => ({ kind: "available", interest: { ...scope, query } })) });

describe("new daily generation configured interest composition", () => {
  it("requires authority and actually resolves it through the canonical daily selector", async () => {
    const input = { replay: null, feedItems: feed, summaryClient: {} as never, clock,
      attestationSink: { record: jest.fn() }, storyRelationVerifier: null };
    expect(() => createReaderSummaryDailyPublicationExecutionWiring(input)).toThrow("configured interest authority");
    const configuredInterests = reader("Mistral financing");
    const wiring = createReaderSummaryDailyPublicationExecutionWiring({ ...input, configuredInterests });
    const selected = await wiring.evidenceSelector.select({ ...scope, scope: { type: "workspace" },
      period: refreshPeriod("2026-09-03"), observedThrough: new Date("2026-09-04T00:00:00Z"), maxItems: 120 });
    expect(selected.selectedEvidence).toHaveLength(0);
    expect(configuredInterests.readCurrent).toHaveBeenCalledTimes(1);
    expect(configuredInterests.readCurrent).toHaveBeenCalledWith({ ...scope, interestId: "synthetic-interest" });
  });

  it("wires historical replacement preflight with current intent independently of copied metadata", async () => {
    const potentialInput = { assessmentCandidateCount: 1, canonicalEvidence: [expect.objectContaining({
      feedItemId: "synthetic-feed", sourceItemId: "synthetic-source", interestId: "synthetic-interest",
      contentQuality: expect.objectContaining({ decision: "needs_context", needsLlmReview: true,
        eligibleForSummary: false, eligibleForTopRead: false,
        reason: "promotion_assessment_pending:missing_result" }),
    })] };
    const configuredInterests = reader("best");
    expect(await preflightRefreshSelection({ feed, date: "2026-09-03",
      observedThrough: new Date("2026-09-04T00:00:00Z"), clock, configuredInterests })).toEqual(potentialInput);
    expect(configuredInterests.readCurrent).toHaveBeenCalledTimes(1);
    expect(configuredInterests.readCurrent).toHaveBeenCalledWith({ ...scope, interestId: "synthetic-interest" });
    const changedIntent = reader("Mistral financing");
    // Preflight cannot certify contextual irrelevance without assessment. Both
    // scopes have potential input; neither copied metadata nor a heuristic is admission.
    expect(await preflightRefreshSelection({ feed, date: "2026-09-03",
      observedThrough: new Date("2026-09-04T00:00:00Z"), clock, configuredInterests: changedIntent }))
      .toEqual(potentialInput);
    expect(changedIntent.readCurrent).toHaveBeenCalledTimes(1);
    expect(changedIntent.readCurrent).toHaveBeenCalledWith({ ...scope, interestId: "synthetic-interest" });
  });
});
