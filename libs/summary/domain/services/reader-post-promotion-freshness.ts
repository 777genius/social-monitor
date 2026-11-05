import type { SummaryEvidenceItem } from
  "../value-objects/summary-evidence-item";

export const readerPostPromotionBoundary = (value: Date): string =>
  value.toISOString().replace(/\.(\d{3})Z$/u, ".$1" + "000Z");

export const readerPostPromotionFreshnessIsValid = (params: {
  readonly facts: SummaryEvidenceItem["promotionFacts"];
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly ingestionCutoff: Date;
}): boolean => {
  const provenance = params.facts?.freshnessProvenance;
  const exactPublished = provenance?.status === "observed"
    ? provenance.exactPublishedAt
    : undefined;
  const exactObserved = provenance?.status === "observed"
    ? provenance.exactObservedAt
    : undefined;
  const exactCutoff = provenance?.status === "observed"
    ? provenance.exactIngestionCutoff
    : undefined;
  const provenanceMatches = provenance !== undefined && (
    provenance.status === "observed" &&
    provenance.publishedAt.getTime() === params.publishedAt.getTime() &&
    provenance.observedAt.getTime() === params.observedAt.getTime() &&
    provenance.ingestionCutoff.getTime() === params.ingestionCutoff.getTime()
  );
  return params.facts?.freshnessValid === true && provenanceMatches &&
    Number.isFinite(params.publishedAt.getTime()) &&
    Number.isFinite(params.observedAt.getTime()) &&
    Number.isFinite(params.ingestionCutoff.getTime()) &&
    (exactPublished === undefined || exactObserved === undefined ||
      exactCutoff === undefined
      ? params.publishedAt.getTime() <= params.observedAt.getTime() &&
        params.observedAt.getTime() <= params.ingestionCutoff.getTime()
      : exactPublished <= exactObserved && exactObserved <= exactCutoff);
};
