import type { ReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import { readerPostPromotionTopProviderCap } from
  "./top-read-provider-diversity-policy";

export const READER_PROMOTION_POLICY_V3 = "reader_promotion_policy.v3" as const;

export type ReaderPostPromotionV3Provider =
  | "x"
  | "reddit"
  | "hacker_news"
  | "rss"
  | "github_radar";

export type ReaderPostPromotionV3Presentation =
  | { readonly status: "available"; readonly presentationInputDigest: string }
  | { readonly status: "unavailable"; readonly reason: string }
  | { readonly status: "budget_exhausted" }
  | { readonly status: "pending" };

export type ReaderPostPromotionV3Candidate = {
  readonly candidateId: string;
  /** Exact persisted provider key. This identity is never rewritten. */
  readonly providerKey: string;
  /** Normalized family used only for ranking diversity. */
  readonly providerFamily: ReaderPostPromotionV3Provider;
  readonly sourceItemId: string;
  readonly canonicalIdentity: string;
  readonly storyId: string;
  readonly publishedAt: string;
  readonly assessmentId: string;
  readonly assessedAt: string;
  readonly rubricVersion: string;
  readonly sourceSnapshotSha256: string;
  readonly inputSha256: string;
  readonly rubricSha256: string;
  readonly modelConfigVersion: string;
  readonly answers: ReaderValueAnswers;
  readonly presentation: ReaderPostPromotionV3Presentation;
  readonly appendixOnly?: boolean;
  readonly scopeValid: boolean;
  readonly sourceIdentityValid: boolean;
  readonly freshnessValid: boolean;
  readonly safetyValid: boolean;
  readonly citationValid: boolean;
  readonly blocked: boolean;
};

export type ReaderPostPromotionV3ExclusionReason =
  | "semantic_not_admitted"
  | "technical_ineligible"
  | "appendix_only"
  | "story_representative"
  | "presentation_unavailable"
  | "presentation_budget_exhausted"
  | "top_provider_cap"
  | "capacity_exhausted";

export type ReaderPostPromotionV3Selection = {
  readonly policyVersion: typeof READER_PROMOTION_POLICY_V3;
  readonly outcome: "ready" | "no_signal" | "presentation_unavailable" |
    "budget_exhausted";
  readonly top: readonly ReaderPostPromotionV3Candidate[];
  readonly additional: readonly ReaderPostPromotionV3Candidate[];
  readonly excluded: readonly {
    readonly candidateId: string;
    readonly reason: ReaderPostPromotionV3ExclusionReason;
  }[];
};

const usefulnessRank = Object.freeze({
  important: 3,
  useful: 2,
  context: 1,
  noise: 0,
  insufficient_context: -1,
});
const relevanceRank = Object.freeze({
  central: 3,
  relevant: 2,
  adjacent: 1,
  unrelated: 0,
  insufficient_context: -1,
});

/** The only V3 ordering authority. Provider probabilities and popularity are absent. */
export const compareReaderPostPromotionV3 = (
  left: ReaderPostPromotionV3Candidate,
  right: ReaderPostPromotionV3Candidate,
): number =>
  usefulnessRank[right.answers.usefulness.choice] -
    usefulnessRank[left.answers.usefulness.choice] ||
  relevanceRank[right.answers.relevance.choice] -
    relevanceRank[left.answers.relevance.choice] ||
  compareTimestampDesc(left.publishedAt, right.publishedAt) ||
  compareUtf8Bytes(left.candidateId, right.candidateId);

export const selectReaderPostPromotionsV3 = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
): ReaderPostPromotionV3Selection => {
  assertCandidateIdentities(candidates);
  const sorted = [...candidates].sort(compareReaderPostPromotionV3);
  const exclusions: Array<{
    candidateId: string;
    reason: ReaderPostPromotionV3ExclusionReason;
  }> = [];
  const admitted = sorted.filter((candidate) => {
    if (!technicallyEligible(candidate)) {
      exclusions.push({ candidateId: candidate.candidateId, reason: "technical_ineligible" });
      return false;
    }
    if (!semanticallyAdmitted(candidate)) {
      exclusions.push({ candidateId: candidate.candidateId, reason: "semantic_not_admitted" });
      return false;
    }
    if (candidate.appendixOnly === true) {
      exclusions.push({ candidateId: candidate.candidateId, reason: "appendix_only" });
      return false;
    }
    return true;
  });
  if (admitted.length === 0) return freezeSelection("no_signal", [], [], exclusions);

  // Every story may fall through to its next globally ranked representative.
  const readyByStory = new Map<string, ReaderPostPromotionV3Candidate>();
  const selectedSourceItems = new Set<string>();
  for (const candidate of admitted) {
    if (readyByStory.has(candidate.storyId) ||
        selectedSourceItems.has(candidate.sourceItemId)) {
      exclusions.push({ candidateId: candidate.candidateId, reason: "story_representative" });
      continue;
    }
    if (candidate.presentation.status === "available") {
      readyByStory.set(candidate.storyId, candidate);
      selectedSourceItems.add(candidate.sourceItemId);
      continue;
    }
    exclusions.push({
      candidateId: candidate.candidateId,
      reason: candidate.presentation.status === "budget_exhausted" ||
          candidate.presentation.status === "pending"
        ? "presentation_budget_exhausted"
        : "presentation_unavailable",
    });
  }
  const ready = [...readyByStory.values()].sort(compareReaderPostPromotionV3);
  if (ready.length === 0) {
    const hasUnavailable = exclusions.some((item) =>
      item.reason === "presentation_unavailable");
    return freezeSelection(
      hasUnavailable ? "presentation_unavailable" : "budget_exhausted",
      [], [], exclusions,
    );
  }

  const activeProviderCount = new Set(ready.map((item) => item.providerFamily)).size;
  const providerCap = Math.min(8, readerPostPromotionTopProviderCap(activeProviderCount));
  const providerCounts = new Map<ReaderPostPromotionV3Provider, number>();
  const top: ReaderPostPromotionV3Candidate[] = [];
  const remainder: ReaderPostPromotionV3Candidate[] = [];
  for (const candidate of ready) {
    const count = providerCounts.get(candidate.providerFamily) ?? 0;
    if (top.length < 8 && count < providerCap) {
      top.push(candidate);
      providerCounts.set(candidate.providerFamily, count + 1);
    } else {
      remainder.push(candidate);
      if (top.length < 8) {
        exclusions.push({ candidateId: candidate.candidateId, reason: "top_provider_cap" });
      }
    }
  }
  const additional = remainder.slice(0, 8);
  for (const candidate of remainder.slice(8)) {
    exclusions.push({ candidateId: candidate.candidateId, reason: "capacity_exhausted" });
  }
  return freezeSelection("ready", top, additional, exclusions);
};

const semanticallyAdmitted = (candidate: ReaderPostPromotionV3Candidate): boolean =>
  (candidate.answers.usefulness.choice === "useful" ||
    candidate.answers.usefulness.choice === "important") &&
  (candidate.answers.relevance.choice === "relevant" ||
    candidate.answers.relevance.choice === "central");

const technicallyEligible = (candidate: ReaderPostPromotionV3Candidate): boolean =>
  candidate.scopeValid && candidate.sourceIdentityValid && candidate.freshnessValid &&
  candidate.safetyValid && candidate.citationValid && !candidate.blocked;

const compareTimestampDesc = (left: string, right: string): number => {
  const leftMicros = timestampMicros(left);
  const rightMicros = timestampMicros(right);
  if (leftMicros === undefined || rightMicros === undefined) {
    throw new Error("V3 promotion candidate has an invalid publishedAt timestamp");
  }
  return leftMicros === rightMicros ? 0 : leftMicros > rightMicros ? -1 : 1;
};

const timestampMicros = (value: string): bigint | undefined => {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3,6})Z$/u.exec(value);
  if (match === null) return undefined;
  const millis = Date.parse(`${match[1]}.${match[2]!.slice(0, 3)}Z`);
  if (!Number.isFinite(millis)) return undefined;
  return BigInt(millis) * 1_000n + BigInt(match[2]!.padEnd(6, "0").slice(3));
};

const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const assertCandidateIdentities = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
): void => {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(candidate.candidateId) || seen.has(candidate.candidateId) ||
      candidate.providerKey.trim().length === 0 ||
      candidate.sourceItemId.trim().length === 0) {
      throw new Error("V3 promotion candidate ids must be unique canonical UUIDs");
    }
    seen.add(candidate.candidateId);
  }
};

const freezeSelection = (
  outcome: ReaderPostPromotionV3Selection["outcome"],
  top: readonly ReaderPostPromotionV3Candidate[],
  additional: readonly ReaderPostPromotionV3Candidate[],
  excluded: readonly { candidateId: string; reason: ReaderPostPromotionV3ExclusionReason }[],
): ReaderPostPromotionV3Selection => Object.freeze({
  policyVersion: READER_PROMOTION_POLICY_V3,
  outcome,
  top: Object.freeze([...top]),
  additional: Object.freeze([...additional]),
  excluded: Object.freeze(excluded.map((item) => Object.freeze({ ...item }))),
});
