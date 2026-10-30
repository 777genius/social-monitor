import type { ReaderDisplayHeadlineSeal } from
  "../value-objects/summary-reader-headline";
import type { ReaderPostPromotionV3RankedCandidate } from
  "../policies/reader-post-promotion-v3";
import {
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3,
  READER_POST_PROMOTION_DIGEST_V3,
  type ReaderPostPromotionAttestationV3,
  type ReaderPostPromotionPlacement,
} from "../policies/reader-post-promotion-policy-contract";
import { READER_PROMOTION_POLICY_STAMP } from "../policies/reader-promotion-ranking";
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
  readonly candidate: ReaderPostPromotionV3RankedCandidate;
  readonly binding: ReaderPostPromotionV3AttestationBinding;
  readonly placement: ReaderPostPromotionPlacement;
  readonly slot: number;
}): ReaderPostPromotionAttestationV3 => {
  const presentation = params.candidate.presentation;
  if (presentation.status !== "available" || params.slot < 1 ||
      params.binding.citationIds.length === 0 ||
      (params.placement === "news") !== (params.candidate.ranking.block === "unranked")) {
    throw new Error("Promotion attestation requires selected display-ready evidence");
  }
  const body = {
    schemaVersion: READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3,
    policyVersion: READER_PROMOTION_POLICY_STAMP,
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
    decision: placementDecision[params.placement],
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
      block: params.candidate.ranking.block,
      providerFamily: params.candidate.providerFamily,
      usefulness: params.candidate.answers.usefulness.choice,
      relevance: params.candidate.answers.relevance.choice,
      engagement: params.candidate.engagement,
      metricMature: params.candidate.ranking.metricMature,
      popularity: params.candidate.ranking.popularity,
      newsPublisher: params.candidate.ranking.newsPublisher,
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

const placementDecision = Object.freeze({
  top: "promote_top",
  additional: "promote_additional",
  news: "promote_news",
} as const satisfies Record<ReaderPostPromotionPlacement,
  ReaderPostPromotionAttestationV3["decision"]>);
