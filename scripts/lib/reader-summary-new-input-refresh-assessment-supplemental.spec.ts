import type { SummaryEvidenceItem } from "@social-monitor/summary/domain";
import { githubTrendingRank, githubTrendingStarsGained } from "@social-monitor/summary/domain";
import { FixedClock } from "@social-monitor/shared-kernel";
import { materializeReaderSummaryEditorialSlate } from "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate";
import { compose, selection, storyCluster, xEvidence } from "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate.spec-support";
import { createRefreshAssessmentReviewer } from "./reader-summary-new-input-refresh-assessment";
import { selectorOutput, selectorWiring } from "./reader-summary-new-input-refresh-selector-composition.spec-support";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";
import { refreshNow } from "./reader-summary-new-input-refresh.spec-support";

async function supplementalFixture() {
  const test = await selectorWiring();
  const social = Array.from({ length: 430 }, (_, index): SummaryEvidenceItem => {
    const item = xEvidence(`synthetic-hard-gate-${index}`, 0);
    return { ...item, sourceText: "Synthetic hard-gated social source.",
      contentQuality: { ...item.contentQuality!, eligibleForSummary: false,
        needsLlmReview: false, decision: "reject", reason: "promotion_assessment_not_requested:hard_gate" } };
  });
  const supplemental = Array.from({ length: 50 }, (_, index): SummaryEvidenceItem => {
    const item = xEvidence(`synthetic-trending-${index}`, 0);
    return { ...item, providerKey: "github-trending-page",
      sourceText: `Synthetic repository source ${index}.`,
      providerMetricLabels: [{ label: "GitHub Trending today", value: `#${index + 1}: +1,234 stars` }],
      promotionFacts: { ...item.promotionFacts!, contentKind: "github_trending" },
      contentQuality: { ...item.contentQuality!, eligibleForSummary: index % 2 === 0,
        needsLlmReview: index % 2 !== 0, decision: index % 2 === 0 ? "keep" : "needs_context",
        reason: "Synthetic canonical supplemental quality" } };
  });
  const canonicalEvidence = [...social, ...supplemental];
  const assessment = createRefreshAssessmentReviewer({ env: {}, runtime: test.runtime,
    clock: new FixedClock(refreshNow), canonicalEvidence });
  const editorial = materializeReaderSummaryEditorialSlate({
    selection: selection([], []), slate: compose([]), supplementalEvidence: supplemental.slice(0, 10),
  });
  return { ...test, assessment, canonicalEvidence, social, supplemental, editorial };
}

it("completes zero assessments for 430 hard gates and 50 canonical supplemental rows, with ten display entries", async () => {
  const test = await supplementalFixture();
  expect(test.canonicalEvidence).toHaveLength(480);
  expect(test.editorial.editorialSlate!.orderedCandidateIds).toEqual([]);
  expect(test.editorial.selectedEvidence).toEqual(test.supplemental.slice(0, 10));
  expect(test.editorial.selectedEvidence.some((item) => !item.contentQuality!.eligibleForSummary)).toBe(true);
  expect(() => test.assessment.assertComplete(0, test.editorial)).not.toThrow();
  expect(test.commands).toEqual([]);
  expect(() => test.runtime.assertUsable()).not.toThrow();
});

const mutations: Record<string, (item: SummaryEvidenceItem) => Partial<SummaryEvidenceItem>> = {
  feed: () => ({ feedItemId: "unknown" }),
  source: () => ({ sourceItemId: "unknown" }),
  binding: () => ({ sourceBindingId: "unknown" }),
  interest: () => ({ interestId: "unknown" }),
  provider: () => ({ providerKey: "reddit" }),
  url: () => ({ canonicalUrl: "https://example.test/changed" }),
  title: () => ({ title: "Changed title" }),
  body: () => ({ bodyPreview: "Changed body" }),
  sourceText: () => ({ sourceText: "Changed complete source" }),
  quality: (item) => ({ contentQuality: { ...item.contentQuality!, qualityScore: 0.123 } }),
  eligibility: (item) => ({ contentQuality: { ...item.contentQuality!, eligibleForSummary: !item.contentQuality!.eligibleForSummary } }),
  review: (item) => ({ contentQuality: { ...item.contentQuality!, needsLlmReview: !item.contentQuality!.needsLlmReview } }),
  reason: (item) => ({ contentQuality: { ...item.contentQuality!, reason: "promotion_assessment:promote" } }),
  appendedMetric: (item) => ({ providerMetricLabels: [...item.providerMetricLabels!,
    { label: "Synthetic fabricated metric", value: "999,999" }] }),
  providerName: () => ({ providerName: "Changed provider" }),
  readerActionKind: () => ({ readerActionKind: "read_source" }),
  score: () => ({ score: 999 }),
  whyImportant: () => ({ whyImportant: ["Changed reason"] }),
  publishedAt: () => ({ publishedAt: new Date("2026-08-31T00:00:00Z") }),
  observedAt: () => ({ observedAt: new Date("2026-08-31T00:00:00Z") }),
  previewMedia: () => ({ previewMedia: { kind: "image", url: "https://example.test/image" } }),
  matchedRules: () => ({ matchedRules: ["Changed rule"] }),
  authorHandle: () => ({ authorHandle: "synthetic-author" }),
  sourceOriginUrl: () => ({ sourceOriginUrl: "https://example.test/origin" }),
  conversationContext: () => ({ conversationContext: { rankingBasis: "cohort_baseline_v1", bundleScore: 99, units: [] } }),
  storyKeyHint: () => ({ storyKeyHint: "changed-story" }),
  providerMetricSummary: () => ({ providerMetricSummary: "Changed metrics" }),
  readerHeadline: () => ({ readerHeadline: { status: "unavailable", reasonCode: "unsafe_text" } }),
  promotion: (item) => ({ promotionFacts: { ...item.promotionFacts!, safetyValid: false } }),
};

describe.each([0, 1])("supplemental canonical row %i", (index) => {
  it.each(Object.keys(mutations))("rejects %s mutation after reviewer construction", async (kind) => {
    const test = await supplementalFixture();
    const item = test.supplemental[index]!;
    // Exercise both eligible and pending quality; eligible rows must not fall
    // through to persisted/exempt bindings when the supplemental seal differs.
    const original = structuredClone(item);
    const changed = { ...item, ...mutations[kind]!(item) };
    Object.assign(item, changed);
    if (kind === "appendedMetric") {
      expect(githubTrendingRank(changed)).toBe(githubTrendingRank(original));
      expect(githubTrendingStarsGained(changed)).toBe(githubTrendingStarsGained(original));
      expect(changed.providerMetricLabels).toHaveLength(original.providerMetricLabels!.length + 1);
    }
    expect(() => test.assessment.assertComplete(0, { ...test.editorial, selectedEvidence: [original] })).not.toThrow();
    expect(() => test.assessment.assertComplete(0, { ...test.editorial, selectedEvidence: [changed] }))
      .toThrow(/reconciliation/u);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  });
});

it("rejects in-place canonical metric mutation while retaining legitimate rank and stars", async () => {
  const test = await supplementalFixture();
  const item = test.supplemental[0]!;
  const original = structuredClone(item);
  Object.assign(item.providerMetricLabels!, { 1: { label: "Synthetic fabricated metric", value: "999,999" } });
  expect(githubTrendingRank(item)).toBe(githubTrendingRank(original));
  expect(githubTrendingStarsGained(item)).toBe(githubTrendingStarsGained(original));
  expect(() => test.assessment.assertComplete(0, { ...test.editorial, selectedEvidence: [original] })).not.toThrow();
  expect(() => test.assessment.assertComplete(0, test.editorial)).toThrow(/reconciliation/u);
});

it.each(["unchanged social", "provider relabel", "full classification relabel"])("rejects %s with zero attempted assessments", async (kind) => {
  const test = await supplementalFixture();
  const social = test.social[0]!;
  const changed = kind === "unchanged social" ? social : { ...social, providerKey: "github-trending-page",
    ...(kind === "full classification relabel" ? {
      promotionFacts: test.supplemental[0]!.promotionFacts,
      contentQuality: test.supplemental[0]!.contentQuality,
    } : {}) };
  expect(() => test.assessment.assertComplete(0, { ...test.editorial, selectedEvidence: [changed] }))
    .toThrow(/reconciliation/u);
});

it.each(["missing slate", "top", "additional", "cluster representative", "cluster duplicate"])(
  "rejects canonical supplemental evidence in %s primary placement", async (placement) => {
    const test = await supplementalFixture();
    // Eligible canonical quality must not fall through to another exemption.
    const item = test.supplemental[0]!;
    const primary = xEvidence("synthetic-primary", 500);
    const entry = compose([primary]).top[0]!;
    const slate = test.editorial.editorialSlate!;
    const changed = { ...test.editorial,
      editorialSlate: placement === "missing slate" ? undefined : {
        ...slate,
        ...(placement === "top" || placement === "additional" ? {
          [placement]: [{ ...entry, placement, candidateId: item.feedItemId }],
        } : {}),
      },
      clusters: placement.startsWith("cluster") ? [storyCluster("primary",
        placement === "cluster representative" ? [item] : [primary, item])] : [],
    };
    expect(() => test.assessment.assertComplete(0, changed)).toThrow(/reconciliation/u);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  },
);

it.each(["needs_context", "bounded rejection"])(
  "keeps supplemental-only selection pending after %s primary coverage", async (kind) => {
    const supplemental = await supplementalFixture();
    const test = await selectorWiring({ extraCandidates: kind === "bounded rejection" ? 199 : 0,
      output: (command) => {
        const output = selectorOutput(command);
        if (command.purpose === sourceContentAssessmentPurpose) {
          for (const review of output.reviews as Record<string, unknown>[]) {
            review.decision = kind === "needs_context" ? kind : "reject";
          }
        }
        return output;
      } });
    const assessment = createRefreshAssessmentReviewer({ env: {}, runtime: test.runtime,
      clock: new FixedClock(refreshNow),
      canonicalEvidence: [...test.preflight.canonicalEvidence, ...supplemental.supplemental] });
    const review = jest.spyOn(test.assessment, "reviewBatch").mockImplementation(assessment.reviewBatch);
    try {
      const primary = await test.select();
      expect(primary.selectedEvidence).toHaveLength(0);
      expect(test.preflight.assessmentCandidateCount).toBe(kind === "bounded rejection" ? 201 : 2);
      // Completed bounded coverage passes the binding gate before the empty-primary guard.
      expect(() => assessment.assertComplete(test.preflight.assessmentCandidateCount)).not.toThrow();
      expect(() => assessment.assertComplete(test.preflight.assessmentCandidateCount, supplemental.editorial))
        .toThrow(/remains pending/u);
      expect(() => test.runtime.assertUsable()).not.toThrow();
    } finally { review.mockRestore(); }
  },
);
