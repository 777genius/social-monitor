import type { SummaryEvidenceItem } from "../../domain";
import { buildReaderPostPromotionProjection } from "../../domain";
import { compose, selection, storyCluster, xEvidence } from "./reader-summary-editorial-slate.spec-support";

// Public source text and quality/metric diagnostics supplied with the original
// incident report. Identity/window scaffolding is synthetic, not a day replay.
export const incident = "How we think about the “wiki incident,” where our agents wrote to several internet sites: it’s past time for us to define standards for when and how we share misalignment incidents, not just misalignment properties of our models. Historically, we have treated misalignment largely as a research question, which gets communicated in research publications such as systems cards. This year, we’ve started to see misalignment cause new types of real-world impact.";
export const context = "Atlas documents agent safety findings across public websites and proposes reporting standards for misalignment incidents and model properties.";
export const simulation = `${context} Atlas bypasses human approval. Only in simulations; production writes require explicit operator approval.`;

export const source = (text = simulation): SummaryEvidenceItem => {
  const item = xEvidence("source", 3230);
  return {
    ...item, title: `${text.slice(0, 100)}...`, bodyPreview: text.slice(0, 280), sourceText: text,
    contentQuality: { ...item.contentQuality!, qualityScore: 1,
      interestRelevanceScore: 0.66, engagementIntegrityScore: 1, decision: "keep" },
    promotionFacts: { ...item.promotionFacts!, metrics: {
      provider: "x", likes: 3230, reposts: 272, weightedScore: 3774,
    } },
  };
};

export const project = (items: readonly SummaryEvidenceItem[]) => {
  const clusters = items.map((item) => storyCluster(item.feedItemId, [item]));
  const input = selection(items, clusters);
  return buildReaderPostPromotionProjection({
    evidence: items, clusters, sourceWindow: input.sourceWindow,
    editorialSlate: compose(items),
    citations: items.map((item) => ({ citationId: `citation:${item.feedItemId}`,
      feedItemId: item.feedItemId, sourceItemId: item.sourceItemId,
      providerKey: item.providerKey, canonicalUrl: item.canonicalUrl, field: "bodyPreview" as const })),
    attestationBinding: { artifactId: "faithful-source-fixture", sourceWindow: input.sourceWindow },
  });
};

