import type { SummaryEvidenceItem } from "../../domain";
import { buildReaderPostPromotionTitle } from "../../domain/services/reader-post-promotion-title";
import { buildTopReadTitle } from "../../domain/services/reader-summary-top-read-title";
import { isReaderFacingQualityTopRead } from "../../domain/policies/rendered-top-read-selection-policy";
import { readerSummaryPromotionV2Candidate } from "./reader-summary-editorial-candidate";
import { selection, xEvidence } from "./reader-summary-editorial-slate.spec-support";

import { incident, context, simulation, source, project } from "./reader-summary-faithful-source.spec-support";

describe("faithful available source admission and projection", () => {
  it("admits the incident with unchanged diagnosed quality and source text", () => {
    const item = source(incident);
    const before = JSON.stringify(item.contentQuality);
    expect(readerSummaryPromotionV2Candidate(item, selection([item], []))?.admission)
      .toEqual({ relevanceFloorMet: true, qualityFloorMet: true, integrityFloorMet: true,
        safetyFloorMet: true, freshnessFloorMet: true });
    const result = project([item]);
    expect(result.topReads[0]?.title).toBe(incident);
    expect(result.attestations[0]).toMatchObject({ candidateId: item.feedItemId,
      qualityScore: 1, relevanceScore: 0.66, integrityScore: 1,
      metrics: { likes: 3230, reposts: 272 },
      evidenceLineage: { leadCandidateId: item.feedItemId, leadCitationId: "citation:source" } });
    expect(JSON.stringify(item.contentQuality)).toBe(before);
  });

  it.each([simulation, `Only in simulations; production writes require explicit operator approval. ${context} Atlas bypasses human approval.`,
    `${context} ${"Further context. ".repeat(30)}Atlas bypasses human approval. That claim has been retracted.`])(
    "retains governing context beyond previews: %s", (text) => {
      const item = source(text);
      const support = xEvidence("other-source", 89);
      expect(buildReaderPostPromotionTitle({ lead: item, admitted: [support],
        promotionReasons: ["Atlas bypasses human approval"] })).toBe(text);
      expect(buildTopReadTitle({ storyTitle: "Atlas bypasses human approval", storySummary: "Detached model title",
        primaryEvidence: item, evidence: [support] })).toBe(text);
      const top = project([item]).topReads[0]!;
      expect(top.title).toBe(text);
      expect(isReaderFacingQualityTopRead({ ...top, providerKey: item.providerKey, signalScore: 2.2,
        reason: "This discussion informs how operators review agent changes." }, [item])).toBe(true);
      expect(isReaderFacingQualityTopRead({ ...top, providerKey: item.providerKey, signalScore: 2.2,
        reason: "This discussion informs how operators review agent changes." }, [support])).toBe(false);
    },
  );

  it("rejects a detached polished assertion in the rendered consumer", () => {
    const item = source();
    const read = project([item]).topReads[0]!;
    expect(isReaderFacingQualityTopRead({ ...read, signalScore: 2.2,
      title: "Atlas bypasses human approval", reason: "Operators review agent safety." }, [item])).toBe(false);
  });

  it("does not introduce a title cap inside the existing 256000-character source cap", () => {
    const ending = " Only in simulations; production writes require approval. ";
    const text = " "+ "Available source context. ".repeat(11000).slice(0, 256000 - ending.length - 1) + ending;
    expect(text).toHaveLength(256000);
    expect(buildReaderPostPromotionTitle({ lead: source(text) })).toBe(text);
  });

  it.each(["", "...", "…"])("preserves all available preview bytes, including incomplete endings %s", (ending) => {
    const text = `${context} Atlas bypasses human approval only after${ending}`;
    const item = { ...source(text), sourceText: undefined, bodyPreview: text };
    expect(project([item]).topReads[0]?.title).toBe(text);
  });

  it("preserves a governing source title absent from the body", () => {
    const item = { ...source("Atlas bypasses human approval."), title: "Simulation only; production requires approval." };
    expect(project([item]).topReads[0]?.title)
      .toBe("Simulation only; production requires approval.\n\nAtlas bypasses human approval.");
  });

  it("preserves the source in Additional after top capacity overflow", () => {
    const item = source(incident);
    const higher = Array.from({ length: 8 }, (_, i) => ({ ...source(`Distinct incident ${i}: ${incident}`),
      feedItemId: `higher-${i}`, sourceItemId: `source-higher-${i}`, canonicalUrl: `https://example.test/higher-${i}`,
      promotionFacts: { ...item.promotionFacts!, canonicalIdentity: `higher:${i}`, metrics: {
        provider: "x" as const, likes: 100_000, reposts: 0, weightedScore: 100_000,
      } } }));
    expect(project([...higher, item]).additionalPosts[0]?.title).toBe(incident);
  });

  it.each(["", "Check this out!", "Current AI product discussion", "https://example.test/only-link"])(
    "rejects missing or filler source without borrowing support or reasons: %s", (text) => {
      const item = { ...source(), title: text, bodyPreview: text, sourceText: text };
      expect(project([item]).topReads).toEqual([]);
      expect(buildReaderPostPromotionTitle({ lead: item, admitted: [source()],
        promotionReasons: [simulation] })).toBe("");
    },
  );

  it.each([
    ["missing quality", (item: SummaryEvidenceItem) => ({ ...item, contentQuality: undefined })],
    ...["downrank", "reject"].map((decision) => [decision, (item: SummaryEvidenceItem) =>
      ({ ...item, contentQuality: { ...item.contentQuality!, decision } })] as const),
    ...["eligibleForSummary", "eligibleForTopRead"].map((field) => [field, (item: SummaryEvidenceItem) =>
      ({ ...item, contentQuality: { ...item.contentQuality!, [field]: false } })] as const),
    ["review needed", (item: SummaryEvidenceItem) => ({ ...item, contentQuality: { ...item.contentQuality!, needsLlmReview: true } })],
    ...["reply", "quote"].map((kind) => [kind, (item: SummaryEvidenceItem) =>
      ({ ...item, promotionFacts: { ...item.promotionFacts!, contentKind: kind as "reply" | "quote" } })] as const),
    ...["safetyValid", "freshnessValid"].map((field) => [field, (item: SummaryEvidenceItem) =>
      ({ ...item, promotionFacts: { ...item.promotionFacts!, [field]: false } })] as const),
    ...["missing", "malformed", "conflict"].map((state) => [state, (item: SummaryEvidenceItem) =>
      ({ ...item, promotionFacts: { ...item.promotionFacts!, metricsState: state as "missing" | "malformed" | "conflict" } })] as const),
    ["missing authority", (item: SummaryEvidenceItem) => ({ ...item, promotionFacts: { ...item.promotionFacts!, engagementAuthority: undefined } })],
    ["stale authority", (item: SummaryEvidenceItem) => ({ ...item, promotionFacts: { ...item.promotionFacts!, engagementAuthority: {
      observedAt: new Date("2026-08-01T00:00:00Z"), regressionState: "stable" as const,
    } } })],
  ] as const)("keeps %s closed for contextual source", (_label, mutate) => {
    const result = project([mutate(source())]);
    expect(result.topReads).toEqual([]);
    expect(result.additionalPosts).toEqual([]);
  });
});
