import type { ReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import type { ReaderPostPromotionEngagement } from "./reader-post-promotion-engagement";
import {
  rankReaderPromotionCandidates,
  type ReaderPromotionCandidateInput,
  type ReaderPromotionExclusionReason,
  type ReaderPromotionRanked,
  type ReaderPromotionRankingResult,
} from "./reader-promotion-ranking";

export type ReaderPostPromotionV3Presentation =
  | { readonly status: "available"; readonly presentationInputDigest: string }
  | { readonly status: "unavailable"; readonly reason: string }
  | { readonly status: "budget_exhausted" }
  | { readonly status: "pending" };

/**
 * Production candidate of the Jev promotion path: the ranking core input
 * plus the frozen assessment and technical validity it was derived from.
 */
export type ReaderPostPromotionV3Candidate = ReaderPromotionCandidateInput & {
  /** Frozen provenance for a pooled workspace candidate. */
  readonly interestId?: string;
  /** Exact persisted provider key. This identity is never rewritten. */
  readonly providerKey: string;
  readonly sourceItemId: string;
  readonly canonicalIdentity: string;
  readonly assessmentId: string;
  readonly assessedAt: string;
  readonly rubricVersion: string;
  readonly sourceSnapshotSha256: string;
  readonly inputSha256: string;
  readonly rubricSha256: string;
  readonly modelConfigVersion: string;
  /** Authoritative answers; `usefulness`/`relevance` mirror their choices. */
  readonly answers: ReaderValueAnswers;
  /** Frozen metric of a ranked source, `null` when unknown. */
  readonly engagement: ReaderPostPromotionEngagement | null;
  readonly presentation: ReaderPostPromotionV3Presentation;
  readonly appendixOnly?: boolean;
  readonly scopeValid: boolean;
  readonly sourceIdentityValid: boolean;
  readonly freshnessValid: boolean;
  readonly safetyValid: boolean;
  readonly citationValid: boolean;
  readonly blocked: boolean;
};

export type ReaderPostPromotionV3RankedCandidate =
  ReaderPromotionRanked<ReaderPostPromotionV3Candidate>;

export type ReaderPostPromotionV3ExclusionReason = ReaderPromotionExclusionReason;

export type ReaderPostPromotionV3Selection =
  ReaderPromotionRankingResult<ReaderPostPromotionV3Candidate> & {
    /** Internal coverage disclosure; publication still binds only sealed survivors. */
    readonly presentationCoverageLimited?: true;
  };

/** Production entry point: identity checks plus the shared ranking core. */
export const selectReaderPostPromotionsV3 = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
): ReaderPostPromotionV3Selection => {
  assertCandidateIdentities(candidates);
  return rankReaderPromotionCandidates(candidates.map((candidate) => ({
    ...candidate, eligible: technicallyEligible(candidate),
  })));
};

export const technicallyEligibleReaderPostPromotion = (
  candidate: Pick<ReaderPostPromotionV3Candidate, "scopeValid" |
    "sourceIdentityValid" | "freshnessValid" | "safetyValid" | "citationValid" |
    "blocked">,
): boolean => candidate.scopeValid && candidate.sourceIdentityValid &&
  candidate.freshnessValid && candidate.safetyValid && candidate.citationValid &&
  !candidate.blocked;

const technicallyEligible = technicallyEligibleReaderPostPromotion;

const assertCandidateIdentities = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
): void => {
  for (const candidate of candidates) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(candidate.candidateId) ||
      candidate.providerKey.trim().length === 0 ||
      candidate.sourceItemId.trim().length === 0 ||
      candidate.usefulness !== candidate.answers.usefulness.choice ||
      candidate.relevance !== candidate.answers.relevance.choice) {
      throw new Error("Promotion candidates need canonical UUIDs and authoritative answers");
    }
  }
};
