import type { ReaderDisplayHeadline } from "../../domain";
import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { promotionPayloadDigest } from "../../domain/services/reader-post-promotion-attestation";

// Only the trusted candidate supplies tenant/workspace/source identity and digest;
// untrusted model proposals cannot supply or replace these binding fields.
export const bind = (input: ReaderPostPresentationV3Input,
  proposal: Record<string, unknown>): ReaderDisplayHeadline => ({
  status: "accepted", kind: proposal.kind as "claim" | "subject_label",
  text: proposal.text as string,
  binding: { candidateId: input.candidateId, providerKey: input.providerKey,
    tenantId: input.tenantId, workspaceId: input.workspaceId,
    interestId: input.interestId, sourceBindingId: input.sourceBindingId,
    sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
    availability: input.body.trim() ? "body_present" : "title_only",
    reviewedInputDigest: promotionPayloadDigest(JSON.stringify({
      candidateId: input.candidateId, providerKey: input.providerKey,
      context: { tenantId: input.tenantId, workspaceId: input.workspaceId,
        interestId: input.interestId, sourceBindingId: input.sourceBindingId,
        sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
        availability: input.body.trim() ? "body_present" : "title_only" },
      title: input.title, body: input.body,
    })) }, support: proposal.support as never,
  qualifications: proposal.qualifications as never,
  confidence: proposal.confidence as number,
  wholeInput: { titleLength: input.title.length, bodyLength: input.body.length,
    qualificationJudgment: proposal.qualificationJudgment as "none" | "preserved" | "subject_only" },
});
