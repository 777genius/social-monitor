import type { SummaryEvidenceItem } from "../domain/value-objects/summary-evidence-item";
import { promotionPayloadDigest } from "../domain/services/reader-post-promotion-attestation";

/** Synthetic fixtures explicitly model a complete capture and accepted batch
 * assessment. Never use this builder to authorize runtime evidence. */
export const acceptedFixtureReaderHeadline = (
  item: SummaryEvidenceItem,
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
): SummaryEvidenceItem => {
  const body = item.sourceText ?? item.bodyPreview ?? "";
  const context = { ...scope, interestId: item.interestId, sourceBindingId: item.sourceBindingId,
    sourceItemId: item.sourceItemId, trustedIntent: "Synthetic summary test interest",
    availability: body.trim() ? "body_present" as const : "title_only" as const };
  return { ...item, sourceText: body, readerHeadline: {
    status: "accepted", kind: "claim", text: item.title, confidence: 0.95,
    binding: { ...context, candidateId: item.feedItemId, providerKey: item.providerKey,
      reviewedInputDigest: promotionPayloadDigest(JSON.stringify({ candidateId: item.feedItemId,
        providerKey: item.providerKey, context, title: item.title, body })) },
    support: [{ field: "title", start: 0, end: item.title.length, quote: item.title }],
    qualifications: [], wholeInput: { titleLength: item.title.length, bodyLength: body.length,
      qualificationJudgment: "none" },
  } };
};

export const withAcceptedFixtureHeadlines = <T extends { readonly selectedEvidence: readonly SummaryEvidenceItem[] }>(
  selection: T, scope: Readonly<{ tenantId: string; workspaceId: string }>,
): T => ({ ...selection, selectedEvidence: selection.selectedEvidence.map((item) =>
  acceptedFixtureReaderHeadline(item, scope)) });
