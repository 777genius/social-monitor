import {
  classifyFeedPromotionEligibility,
  evaluateReaderPromotionV2,
  type ReaderPromotionV2Candidate,
} from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";
import { readerSummaryPromotionV2Candidate } from
  "@social-monitor/summary/adapters/evidence/reader-summary-editorial-candidate";
import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "@social-monitor/summary/domain";

import { SourceContentQualityPolicy } from
  "@social-monitor/relevance/domain/source-content-quality";
import { SourceContentSafetyPolicy } from
  "@social-monitor/relevance/domain/source-content-safety";
import { promotionSafeProviderMetadata } from
  "@social-monitor/relevance/features/rank-feed-items/rank-feed-item-projection";

// User-supplied public title, URL, identities and observed score only.
// The original 839-character body is unavailable; this is not a full-post replay.
const publicTitle = "Has anyone else felt like their life has improved significantly since using ChatGPT?";
const publicUrl = "https://www.reddit.com/r/ChatGPT/comments/1w7nv0q/has_anyone_else_felt_like_their_life_has_improved/";
const observedMetadata = { kind: "reddit_post", score: 444 };

describe("exact Reddit title through canonical metadata, quality and V2 admission", () => {
  it("admits the explicit title when independently supplied fixture gates pass", () => {
    const { safeMetadata, quality, item, candidate } = titleOnlyFixture();
    expect(safeMetadata).toEqual({
      kind: "reddit_post", contentKind: "original_post", score: 444,
    });
    expect(item.title).toBe(publicTitle);
    expect(item.bodyPreview).toBeUndefined();
    expect(item.sourceText).toBeUndefined();
    expect(quality).toMatchObject({
      qualityScore: 0.95,
      interestRelevanceScore: 0.78,
      engagementIntegrityScore: 0.92,
      eligibleForSummary: true,
      eligibleForTopRead: true,
      needsLlmReview: false,
      decision: "promote",
      // This flag records missing query metadata, which remains unchanged.
      flags: ["missing_topic_context"],
    });
    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: true,
      topQualified: true,
      providerSignal: 444,
      relativePopularity: 8.88,
      admissionAttestation: {
        relevance: { minimum: 0.5, passed: true },
        quality: { minimum: 0.55, passed: true },
        integrity: { minimum: 0.5, passed: true },
        provider: { admissionFloor: 25, topFloor: 50, passed: true },
      },
    });
  });

  it.each(["it", "prechatgpt", "chatgptish", "chatgpt2", "chatgpt_helper"])(
    "keeps the same URL and popularity ineligible with unrelated title text %s",
    (term) => {
      const { quality, candidate } = titleOnlyFixture(
        publicTitle.replace("ChatGPT", term),
      );
      expect(quality).toMatchObject({
        qualityScore: 0.95,
        interestRelevanceScore: 0.49,
        engagementIntegrityScore: 0.92,
        eligibleForSummary: true,
        eligibleForTopRead: false,
        decision: "downrank",
        flags: ["missing_topic_context"],
      });
      expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
        admitted: false,
        reasons: ["relevance_floor_not_met", "quality_floor_not_met"],
      });
    },
  );

  it("does not depend on query or community fields removed by canonical metadata", () => {
    // Synthetic metadata extras exercise canonical stripping, not real provenance.
    const metadata = {
      ...observedMetadata,
      subreddit: "ChatGPT",
      interestQuerySnapshot: { query: "AI" },
    };
    const { safeMetadata, quality } = titleOnlyFixture(publicTitle, metadata);
    expect(safeMetadata).toEqual(titleOnlyFixture().safeMetadata);
    expect(quality).toEqual(titleOnlyFixture().quality);
    expect(metadata.interestQuerySnapshot).toEqual({ query: "AI" });
  });

  it.each([
    ["relevanceScore", 0.49, "relevance_floor_not_met"],
    ["evidenceQualityScore", 0.54, "quality_floor_not_met"],
    ["integrityScore", 0.49, "integrity_floor_not_met"],
  ] as const)("still enforces the independent %s floor", (field, score, reason) => {
    const { candidate } = titleOnlyFixture();
    expect(evaluateReaderPromotionV2({ ...candidate, [field]: score }))
      .toMatchObject({ admitted: false, reasons: [reason] });
  });

  it.each([
    ["safetyFloorMet", "safety_floor_not_met"],
    ["freshnessFloorMet", "freshness_floor_not_met"],
  ] as const)("still enforces %s", (field, reason) => {
    const { candidate } = titleOnlyFixture();
    expect(evaluateReaderPromotionV2({
      ...candidate, admission: { ...candidate.admission, [field]: false },
    })).toMatchObject({ admitted: false, reasons: [reason] });
  });

  it("does not turn the supplied score into verified metric authority", () => {
    const { item, selection } = titleOnlyFixture();
    const candidate = readerSummaryPromotionV2Candidate({
      ...item,
      promotionFacts: { ...item.promotionFacts!, engagementAuthority: undefined },
    }, selection)!;
    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: false, reasons: ["engagement_unauthoritative"],
    });
  });

  it("does not bypass the provider floor when explicit topic context exists", () => {
    const { candidate } = titleOnlyFixture(publicTitle, {
      ...observedMetadata, score: 24,
    });
    expect(evaluateReaderPromotionV2(candidate)).toMatchObject({
      admitted: false, reasons: ["provider_floor_not_met"],
    });
  });
});

const titleOnlyFixture = (
  title = publicTitle,
  metadata: JsonObject = observedMetadata,
) => {
  const safeMetadata = promotionSafeProviderMetadata("reddit", metadata);
  const canonical = classifyFeedPromotionEligibility({
    providerKey: "reddit", providerMetadata: safeMetadata,
  });
  if (!canonical.eligible || canonical.metrics.kind !== "reddit_post") {
    throw new Error("Expected canonical Reddit fixture metrics");
  }
  const safety = new SourceContentSafetyPolicy().evaluate({
    providerKey: "reddit", title, canonicalUrl: publicUrl,
  });
  const quality = new SourceContentQualityPolicy().evaluate({
    providerKey: "reddit",
    title: safety.sanitizedTitle,
    canonicalUrl: safety.sanitizedCanonicalUrl,
    providerMetadata: safeMetadata,
  });
  // All timing, binding and authority fields below are synthetic test controls.
  // They prove conditional policy admission, not actual durable post eligibility.
  const publishedAt = new Date("2026-09-05T12:00:00.000Z");
  const observedAt = new Date("2026-09-05T13:00:00.000Z");
  const cutoff = new Date("2026-09-05T14:00:00.000Z");
  const item: SummaryEvidenceItem = {
    feedItemId: "3cbf8b8d-5174-4a97-bdf8-7e0718da03d0",
    sourceItemId: "59d38ff3-98ce-43a7-8297-4a746145899b",
    sourceBindingId: "test-title-only-binding",
    interestId: "test-title-only-interest",
    providerKey: "reddit",
    canonicalUrl: publicUrl,
    title: safety.sanitizedTitle,
    publishedAt,
    observedAt,
    score: 0,
    whyImportant: [],
    contentQuality: quality,
    promotionFacts: {
      contentKind: canonical.contentKind,
      canonicalIdentity: publicUrl,
      safetyValid: safety.status === "allowed",
      freshnessValid: true,
      freshnessProvenance: {
        status: "observed", publishedAt, observedAt, ingestionCutoff: cutoff,
      },
      metricsState: canonical.metricsState,
      metrics: { provider: "reddit", score: canonical.metrics.score },
      engagementAuthority: { observedAt, regressionState: "stable" },
    },
  };
  const selection: SummaryEvidenceSelection = {
    rankingPolicyVersion: "title-only-test",
    sourceWindow: {
      windowId: "title-only-test",
      startedAt: new Date("2026-09-05T00:00:00.000Z"),
      endedAt: cutoff,
      ingestionCutoff: cutoff,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    selectedEvidence: [],
    clusters: [],
  };
  const candidate: ReaderPromotionV2Candidate =
    readerSummaryPromotionV2Candidate(item, selection)!;
  return { safeMetadata, quality, item, selection, candidate };
};
