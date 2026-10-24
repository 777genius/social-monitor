import type { ReaderValueAssessment } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";

import { acceptedFixtureReaderHeadline } from
  "../../test-fixtures/accepted-reader-headline";
import type { ReaderSummaryPreparationCandidate } from "../../domain";
import type { ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { clusteringEvidenceItem, evidenceItem } from
  "./relevance-reader-summary-v3-source-evidence";
import { engagementOrContentStrengthSignalScore } from
  "../../domain/value-objects/signal-score";

const scope = { tenantId: "tenant-citation-url", workspaceId: "workspace-citation-url" };

describe("V3 evidence citation URL authority", () => {
  it.each([
    ["root URL keeps no trailing slash", "https://jevcards.com", "https://jevcards.com"],
    ["root URL with trailing slash", "https://jevcards.com/", "https://jevcards.com"],
    ["benign query is dropped", "https://example.test/article?edition=2",
      "https://example.test/article"],
    ["hacker news item query is retained", "https://news.ycombinator.com/item?id=42",
      "https://news.ycombinator.com/item?id=42"],
    ["article path is unchanged", "https://example.test/post/metrics",
      "https://example.test/post/metrics"],
  ])("binds display-safe citation URLs (%s)", (_case, identity, expected) => {
    const lead = clusteringEvidenceItem(frozen(identity), presentationInput(),
      assessment());
    expect(lead.canonicalUrl).toBe(expected);
    const sealed = evidenceItem(frozen(identity), presentationInput(), assessment(),
      { headline: acceptedHeadline(lead) });
    expect(sealed.canonicalUrl).toBe(expected);
    expect(sealed.canonicalUrl).toBe(lead.canonicalUrl);
  });

  it("feeds the content-strength signal score from the evidence quality verdict", () => {
    const lead = clusteringEvidenceItem(frozen("https://example.test/post/quality"),
      presentationInput(), assessment());
    expect(lead.providerMetricStrength).toBeUndefined();
    expect(lead.contentQuality).toEqual(
      expect.objectContaining({ eligibleForSummary: true }),
    );
    expect(lead.contentQuality!.qualityScore).toBeGreaterThan(0);
    const sealed = evidenceItem(frozen("https://example.test/post/quality"),
      presentationInput(), assessment(), { headline: acceptedHeadline(lead) });
    expect(engagementOrContentStrengthSignalScore({
      engagementStrength: sealed.providerMetricStrength,
      contentQuality: sealed.contentQuality,
    })).toBeGreaterThan(0);
  });
});

const frozen = (canonicalIdentity: string): ReaderSummaryPreparationCandidate => ({
  candidateId: "00000000-0000-4000-8000-000000000005",
  sourceBindingId: "binding-citation-url",
  providerKey: "rss",
  sourceItemId: "source-citation-url",
  sourceRevisionKey: "revision-citation-url",
  sourceSnapshotSha256: "1".repeat(64),
  assessmentId: "assessment-citation-url",
  inputSha256: "2".repeat(64),
  publishedAt: "2026-07-05T08:30:00.000000Z",
  observedAt: "2026-07-05T08:31:00.000000Z",
  sourceKind: "post",
  canonicalIdentity,
});

const presentationInput = (): ReaderPostPresentationV3Input => ({
  tenantId: scope.tenantId, workspaceId: scope.workspaceId,
  interestId: "interest-citation-url",
  candidateId: "00000000-0000-4000-8000-000000000005",
  sourceItemId: "source-citation-url", sourceBindingId: "binding-citation-url",
  providerKey: "rss", trustedIntent: "Synthetic summary test interest",
  sourceSnapshotSha256: "1".repeat(64),
  title: "Citation URL headline", body: "Citation URL body",
  captureComplete: true,
});

const assessment = (): ReaderValueAssessment => ({
  input: { interestId: "interest-citation-url" },
} as unknown as ReaderValueAssessment);

const acceptedHeadline = (lead: ReturnType<typeof clusteringEvidenceItem>) =>
  acceptedFixtureReaderHeadline(lead, scope).readerHeadline!;
