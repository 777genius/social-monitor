import type { ReaderValueAssessment } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";

import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";
import type { ReaderSummaryPreparationCandidate } from "../../domain";
import type { ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { providerMetricFacts } from "./reader-summary-provider-evidence";
import { readerPostPromotionEngagementFact } from "./reader-post-promotion-engagement-facts";
import { clusteringEvidenceItem, evidenceItem } from
  "./relevance-reader-summary-v3-source-evidence";

const scope = { tenantId: "tenant-metrics", workspaceId: "workspace-metrics" };
const xMetadata = { kind: "x_post", contentKind: "original_post",
  likes: 37, reposts: 2 } as const;
const expectedLabels = [{ label: "Likes", value: "37" },
  { label: "Reposts", value: "2" }];

describe("Promotion engagement facts", () => {
  it("derives display labels and engagement strength from provider metadata", () => {
    const facts = providerMetricFacts({ providerKey: "x-twitter",
      providerMetadata: { ...xMetadata } });
    expect(facts.providerMetricLabels).toEqual(expectedLabels);
    expect(facts.providerMetricStrength).toBeGreaterThan(0);
  });

  it("substitutes frozen engagement facts into V3 evidence items", () => {
    const lead = clusteringEvidenceItem(frozen(), presentationInput(), assessment());
    expect(lead.providerMetricLabels).toEqual(expectedLabels);
    expect(lead.providerMetricStrength).toBeGreaterThan(0);
    const display = acceptedFixtureReaderHeadline(lead, scope);
    const sealed = evidenceItem(frozen(), presentationInput(), assessment(),
      { headline: display.readerHeadline! });
    expect(sealed.providerMetricLabels).toEqual(expectedLabels);
    expect(sealed.providerMetricStrength).toBeGreaterThan(0);
    expect(sealed.readerHeadline?.status).toBe("accepted");
  });

  it("freezes the ranked signal value with its snapshot time and nothing else", () => {
    const observedAt = "2026-07-05T15:00:00.123456Z";
    expect(readerPostPromotionEngagementFact({ providerKey: "x-twitter",
      providerMetadata: { ...xMetadata }, engagementObservedAt: observedAt }))
      .toEqual({ method: "likes_plus_two_reposts", value: 41, observedAt });
    expect(readerPostPromotionEngagementFact({ providerKey: "reddit",
      providerMetadata: { kind: "reddit_post", score: 984 },
      engagementObservedAt: "2026-07-05 15:00:00.5+00" }))
      .toEqual({ method: "reddit_score", value: 984,
        observedAt: "2026-07-05T15:00:00.500000Z" });
  });

  it.each([
    ["never observed", "x-twitter", { ...xMetadata }, null],
    ["malformed metric", "x-twitter", { ...xMetadata, likes: -1 }, "2026-07-05T15:00:00.000000Z"],
    ["missing metadata", "hacker-news", undefined, "2026-07-05T15:00:00.000000Z"],
    ["unranked source", "rss", { kind: "rss_item", score: 50 }, "2026-07-05T15:00:00.000000Z"],
  ] as const)("keeps the metric unknown when %s", (_label, providerKey, metadata, observedAt) => {
    expect(readerPostPromotionEngagementFact({ providerKey,
      ...(metadata === undefined ? {} : { providerMetadata: metadata }),
      engagementObservedAt: observedAt })).toBeNull();
  });
});

const frozen = (): ReaderSummaryPreparationCandidate => ({
  candidateId: "00000000-0000-4000-8000-000000000005",
  sourceBindingId: "binding-metrics",
  providerKey: "x-twitter",
  sourceItemId: "source-metrics",
  sourceRevisionKey: "revision-metrics",
  sourceSnapshotSha256: "1".repeat(64),
  assessmentId: "assessment-metrics",
  inputSha256: "2".repeat(64),
  publishedAt: "2026-07-05T08:30:00.000000Z",
  observedAt: "2026-07-05T08:31:00.000000Z",
  sourceKind: "post",
  canonicalIdentity: "https://example.test/post/metrics",
  providerMetadata: { ...xMetadata },
});

const presentationInput = (): ReaderPostPresentationV3Input => ({
  tenantId: scope.tenantId, workspaceId: scope.workspaceId,
  interestId: "interest-metrics",
  candidateId: "00000000-0000-4000-8000-000000000005",
  sourceItemId: "source-metrics", sourceBindingId: "binding-metrics",
  providerKey: "x-twitter", trustedIntent: "Synthetic summary test interest",
  sourceSnapshotSha256: "1".repeat(64),
  title: "Engagement metrics headline", body: "Engagement metrics body",
  captureComplete: true,
});

const assessment = (): ReaderValueAssessment => ({
  input: { interestId: "interest-metrics" },
} as unknown as ReaderValueAssessment);
