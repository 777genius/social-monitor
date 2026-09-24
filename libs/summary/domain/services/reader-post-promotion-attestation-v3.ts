import type { ReaderDisplayHeadlineSeal } from
  "../value-objects/summary-reader-headline";
import type { ReaderPostPromotionV3Candidate } from
  "../policies/reader-post-promotion-v3";
import {
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3,
  READER_POST_PROMOTION_DIGEST_V3,
  READER_POST_PROMOTION_POLICY_V3,
  type ReaderPostPromotionAttestationV3,
} from "../policies/reader-post-promotion-policy-contract";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "./reader-post-promotion-attestation";
import { readerPostPresentationV3Identity } from "./reader-post-presentation-v3";

export type ReaderPostPromotionV3AttestationBinding = {
  readonly artifactId: string;
  readonly sourceWindowId: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly ingestionCutoff: Date;
  readonly exactIngestionCutoff: string;
  readonly citationIds: readonly string[];
  readonly assessedAt: string;
  readonly rubricVersion: string;
  readonly displayHeadline: ReaderDisplayHeadlineSeal;
};

export const buildReaderPostPromotionAttestationV3 = (params: {
  readonly candidate: ReaderPostPromotionV3Candidate;
  readonly binding: ReaderPostPromotionV3AttestationBinding;
  readonly placement: "top" | "additional";
  readonly slot: number;
}): ReaderPostPromotionAttestationV3 => {
  const presentation = params.candidate.presentation;
  if (presentation.status !== "available" || params.slot < 1 ||
      params.binding.citationIds.length === 0) {
    throw new Error("V3 attestation requires selected display-ready evidence");
  }
  const body = {
    schemaVersion: READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3,
    policyVersion: READER_POST_PROMOTION_POLICY_V3,
    digestVersion: READER_POST_PROMOTION_DIGEST_V3,
    artifactId: params.binding.artifactId,
    sourceWindowId: params.binding.sourceWindowId,
    periodStartedAt: params.binding.periodStartedAt,
    periodEndedAt: params.binding.periodEndedAt,
    ingestionCutoff: params.binding.ingestionCutoff,
    exactIngestionCutoff: params.binding.exactIngestionCutoff,
    placement: params.placement,
    slot: params.slot,
    candidateId: params.candidate.candidateId,
    provider: params.candidate.providerKey,
    canonicalIdentity: params.candidate.canonicalIdentity,
    storyId: params.candidate.storyId,
    publishedAt: params.candidate.publishedAt,
    citationIds: params.binding.citationIds,
    decision: params.placement === "top"
      ? "promote_top" as const
      : "promote_additional" as const,
    assessment: {
      schemaVersion: "reader_value.v1" as const,
      assessmentId: params.candidate.assessmentId,
      assessedAt: params.binding.assessedAt,
      sourceSnapshotSha256: params.candidate.sourceSnapshotSha256,
      inputSha256: params.candidate.inputSha256,
      rubricVersion: params.binding.rubricVersion,
      rubricSha256: params.candidate.rubricSha256,
      modelConfigVersion: params.candidate.modelConfigVersion,
      answers: params.candidate.answers,
    },
    comparator: {
      usefulness: params.candidate.answers.usefulness.choice,
      relevance: params.candidate.answers.relevance.choice,
      publishedAt: params.candidate.publishedAt,
      candidateId: params.candidate.candidateId,
    },
    presentation: {
      schemaVersion: "reader_post_presentation.v3" as const,
      presentationInputDigest: presentation.presentationInputDigest,
      presentationIdentity: readerPostPresentationV3Identity({
        sourceSnapshotSha256: params.candidate.sourceSnapshotSha256,
        presentationInputDigest: presentation.presentationInputDigest,
        displayHeadline: params.binding.displayHeadline,
      }),
      displayHeadline: params.binding.displayHeadline,
    },
  };
  const canonicalPayload = canonicalPromotionPayload(body);
  return Object.freeze({
    ...body,
    canonicalPayload,
    digest: promotionPayloadDigest(canonicalPayload),
  });
};
