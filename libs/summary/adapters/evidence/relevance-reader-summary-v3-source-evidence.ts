import type { ReaderValueAssessment } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import { sanitizeSourceUrl } from
  "@social-monitor/relevance/domain/source-content-safety";
import { SourceContentQualityPolicy } from
  "@social-monitor/relevance/domain/source-content-quality";

import type { ReaderSummaryPreparationCandidate,
  ReaderDisplayHeadlineSeal, SummaryEvidenceItem } from "../../domain";
import type { ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { providerMetricFacts } from "./reader-summary-provider-evidence";

export const evidenceItem = (
  frozen: ReaderSummaryPreparationCandidate,
  input: ReaderPostPresentationV3Input,
  assessment: ReaderValueAssessment,
  seal: ReaderDisplayHeadlineSeal,
): SummaryEvidenceItem => ({
  readerHeadline: seal.headline,
  feedItemId: frozen.candidateId, sourceItemId: frozen.sourceItemId,
  sourceBindingId: frozen.sourceBindingId, interestId: assessment.input.interestId,
  providerKey: frozen.providerKey, canonicalUrl: displayCanonicalUrl(frozen.canonicalIdentity),
  title: input.title, bodyPreview: input.body, sourceText: input.body,
  publishedAt: new Date(frozen.publishedAt), observedAt: new Date(frozen.observedAt),
  score: 0, whyImportant: [], readerActionKind: "read_source",
  storyKeyHint: frozen.storyId,
  contentQuality: evidenceContentQuality(frozen, input),
  ...providerMetricFacts({
    providerKey: frozen.providerKey,
    providerMetadata: frozen.providerMetadata,
  }),
});

// Must mirror public.reader_summary_safe_citation_url; the identity form is promotion-only.
const displayCanonicalUrl = (identity: string): string =>
  sanitizeSourceUrl(identity).value ?? identity;

const contentQualityPolicy = new SourceContentQualityPolicy();

const evidenceContentQuality = (
  frozen: ReaderSummaryPreparationCandidate,
  input: ReaderPostPresentationV3Input,
) => contentQualityPolicy.evaluate({
  providerKey: frozen.providerKey,
  title: input.title,
  bodyPreview: input.body,
  canonicalUrl: displayCanonicalUrl(frozen.canonicalIdentity),
  providerMetadata: frozen.providerMetadata,
});

export const clusteringEvidenceItem = (
  frozen: ReaderSummaryPreparationCandidate,
  input: ReaderPostPresentationV3Input,
  assessment: ReaderValueAssessment,
): SummaryEvidenceItem => ({
  feedItemId: frozen.candidateId, sourceItemId: frozen.sourceItemId,
  sourceBindingId: frozen.sourceBindingId, interestId: assessment.input.interestId,
  providerKey: frozen.providerKey, canonicalUrl: displayCanonicalUrl(frozen.canonicalIdentity),
  title: input.title, bodyPreview: input.body, sourceText: input.body,
  publishedAt: new Date(frozen.publishedAt), observedAt: new Date(frozen.observedAt),
  score: 0, whyImportant: [], storyKeyHint: frozen.storyId,
  contentQuality: evidenceContentQuality(frozen, input),
  ...providerMetricFacts({
    providerKey: frozen.providerKey,
    providerMetadata: frozen.providerMetadata,
  }),
});
