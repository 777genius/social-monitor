import type { SummaryEvidenceItem } from "../../domain";
import type { SummaryReaderHeadline } from "../../domain/value-objects/summary-reader-headline";
import { promotionPayloadDigest } from "../../domain/services/reader-post-promotion-attestation";
import { source } from "./reader-summary-faithful-source.spec-support";

export const headlineScope = { tenantId: "tenant-reader-summary-prisma", workspaceId: "workspace-reader-summary-prisma" };
export const assessedSource = (
  body = "Orion benchmark findings are preliminary. Final correction: simulation only.",
  text = "Orion benchmark findings are preliminary; simulation only",
): SummaryEvidenceItem => {
  const item = { ...source(body), title: "Orion benchmark findings", sourceText: body };
  return withAssessment(item, text);
};
export const withAssessment = (item: SummaryEvidenceItem, text: string): SummaryEvidenceItem => {
  const body = item.sourceText ?? "";
  const context = { ...headlineScope, interestId: item.interestId, sourceBindingId: item.sourceBindingId,
    sourceItemId: item.sourceItemId, trustedIntent: "Track Orion benchmark research",
    availability: body.trim() ? "body_present" as const : "title_only" as const };
  const qualifier = "simulation only";
  const start = body.indexOf(qualifier);
  const qualifications = start < 0 ? [] : [{ phrase: qualifier,
    evidence: [{ field: "bodyPreview" as const, start, end: start + qualifier.length, quote: qualifier }] }];
  const readerHeadline: SummaryReaderHeadline = {
    status: "accepted", kind: "claim", text,
    binding: { ...context, candidateId: item.feedItemId, providerKey: item.providerKey,
      reviewedInputDigest: promotionPayloadDigest(JSON.stringify({ candidateId: item.feedItemId,
        providerKey: item.providerKey, context, title: item.title, body })) },
    support: [{ field: "title", start: 0, end: item.title.length, quote: item.title }],
    qualifications, confidence: 0.95,
    wholeInput: { titleLength: item.title.length, bodyLength: body.length,
      qualificationJudgment: qualifications.length ? "preserved" : "none" },
  };
  return { ...item, readerHeadline };
};
