import type { ReaderValueAssessment } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import type { ReaderValueAnswers, ReaderValueCriterion } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";
import type {
  ReaderSummaryPreparationCandidate, SummaryEvidenceItem,
} from "../../domain";
import { readerPostPromotionV3SignalScore } from
  "../../domain/policies/reader-post-promotion-v3";
import type { ReaderPostPromotionV3Candidate } from
  "../../domain/policies/reader-post-promotion-v3";
import { buildReaderPostPromotionProjection } from
  "../../domain/services/reader-post-promotion-projection";
import type { ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { providerMetricFacts } from "./reader-summary-provider-evidence";
import { clusteringEvidenceItem, evidenceItem } from
  "./relevance-reader-summary-v3-source-evidence";

const scope = { tenantId: "tenant-metrics", workspaceId: "workspace-metrics" };
const xMetadata = { kind: "x_post", contentKind: "original_post",
  likes: 37, reposts: 2 } as const;
const expectedLabels = [{ label: "Likes", value: "37" },
  { label: "Reposts", value: "2" }];

describe("V3 engagement metric substitution", () => {
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

  it("projects provider metrics and a nonzero signal score into top-read cards", () => {
    const lead = clusteringEvidenceItem(frozen(), presentationInput(), assessment());
    const display = acceptedFixtureReaderHeadline(lead, scope);
    const sealed: SummaryEvidenceItem = evidenceItem(frozen(), presentationInput(),
      assessment(), { headline: display.readerHeadline! });
    const candidate = promotionCandidate(sealed);
    const projection = buildReaderPostPromotionProjection({
      evidence: [sealed], clusters: [], citations: [{
        citationId: "citation-metrics", feedItemId: sealed.feedItemId,
        sourceItemId: sealed.sourceItemId, providerKey: sealed.providerKey,
        field: "canonicalUrl", canonicalUrl: sealed.canonicalUrl,
      }],
      sourceWindow: { windowId: "window-metrics",
        startedAt: new Date("2026-07-05T08:00:00Z"),
        endedAt: new Date("2026-07-05T09:00:00Z"),
        selectedFeedItemIds: [sealed.feedItemId],
        storyClusterIds: [candidate.storyId] },
      promotionV3: { policyVersion: "reader_promotion_policy.v3", outcome: "ready",
        top: [candidate], additional: [], excluded: [] },
    });
    const card = projection.topReads[0]!;
    expect(card.providerMetrics).toEqual(expectedLabels);
    expect(card.signalScore).toBeGreaterThan(0);
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

const promotionCandidate = (lead: SummaryEvidenceItem):
ReaderPostPromotionV3Candidate => ({
  candidateId: lead.feedItemId,
  providerKey: lead.providerKey,
  providerFamily: "x",
  sourceItemId: lead.sourceItemId,
  canonicalIdentity: lead.canonicalUrl,
  storyId: "story-metrics",
  publishedAt: "2026-07-05T08:30:00.000000Z",
  assessmentId: "assessment-metrics",
  assessedAt: "2026-07-05T08:40:00.000000Z",
  rubricVersion: "reader-value.v1",
  sourceSnapshotSha256: "1".repeat(64),
  inputSha256: "2".repeat(64),
  rubricSha256: "3".repeat(64),
  modelConfigVersion: "model.v1",
  answers: answers("important"),
  signalScore: readerPostPromotionV3SignalScore({
    engagementStrength: lead.providerMetricStrength,
    contentQuality: lead.contentQuality,
  }),
  presentation: { status: "available", presentationInputDigest: "4".repeat(64) },
  scopeValid: true, sourceIdentityValid: true, freshnessValid: true,
  safetyValid: true, citationValid: true, blocked: false,
});

const answers = (usefulness: ReaderValueAnswers["usefulness"]["choice"]):
ReaderValueAnswers => ({
  usefulness: answer("usefulness", usefulness,
    ["noise", "context", "useful", "important", "insufficient_context"]),
  relevance: answer("relevance", "central",
    ["unrelated", "adjacent", "relevant", "central", "insufficient_context"]),
  context_sufficiency: answer("context_sufficiency", "sufficient",
    ["insufficient", "partial", "sufficient"]),
  evidence_basis: answer("evidence_basis", "observation",
    ["observation", "described_data", "linked_claim", "unsupported_claim",
      "no_claim", "insufficient_context"]),
});

const answer = <K extends ReaderValueCriterion>(criterion: K,
  choice: ReaderValueAnswers[K]["choice"],
  choices: readonly string[]): ReaderValueAnswers[K] => ({
    choice,
    probabilities: Object.fromEntries(choices.map((value) =>
      [value, value === choice ? 1 : 0])),
    confidence: 0.9, choiceDiffersFromArgmax: false, probabilityTie: false,
  }) as ReaderValueAnswers[K];
