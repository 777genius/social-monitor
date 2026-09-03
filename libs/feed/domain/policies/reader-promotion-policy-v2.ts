import {
  READER_PROMOTION_POLICY_V2_VERSION,
  type AdmittedReaderPromotionV2,
  type ReaderPromotionV2AdmissionAttestation,
  type ReaderPromotionV2Candidate,
  type ReaderPromotionV2Evaluation,
  type ReaderPromotionV2ObservedMetrics,
  type ReaderPromotionV2Ranking,
  type ReaderPromotionV2RejectionReason,
  type ReaderPromotionV2ScoreComponents,
} from "../value-objects/reader-promotion-v2-candidate";
import {
  evaluateReaderPromotionEngagementAuthority,
  type AdmittedReaderPromotionEngagementAuthority,
} from "./reader-promotion-engagement-authority";

export * from "../value-objects/reader-promotion-v2-candidate";

const weights = Object.freeze({
  engagement: 0.4,
  relevance: 0.3,
  evidenceQuality: 0.15,
  integrity: 0.1,
  freshness: 0.05,
});

const expectedContentKind = Object.freeze({
  x: "original_post",
  reddit: "original_post",
  hacker_news: "story",
  github: "repository",
} as const);

type ProviderSignal = {
  readonly value: number;
  readonly method:
    | "likes_plus_two_reposts"
    | "reddit_score_or_upvotes"
    | "hacker_news_points"
    | "max_stars_or_half_forks_24h";
  readonly admissionFloor: number;
  readonly topFloor: number;
  readonly floorMet: boolean;
};

type EngagementResult =
  | {
      readonly signal: ProviderSignal;
      readonly authority: AdmittedReaderPromotionEngagementAuthority;
    }
  | { readonly reason: ReaderPromotionV2RejectionReason };

type ProviderSignalResult =
  | { readonly signal: ProviderSignal }
  | { readonly reason: ReaderPromotionV2RejectionReason };

export const evaluateReaderPromotionV2 = (
  candidate: ReaderPromotionV2Candidate,
): ReaderPromotionV2Evaluation => {
  const reasons = hardAdmissionFailures(candidate);
  const engagement = engagementResult(candidate);
  if ("reason" in engagement) reasons.push(engagement.reason);
  if (reasons.length > 0 || !("signal" in engagement)) {
    return rejected(candidate, reasons);
  }

  const { signal } = engagement;
  const rawRelativePopularity = signal.value / signal.topFloor;
  const topQualified = signal.value >= signal.topFloor;
  const relativePopularity = rounded(rawRelativePopularity);
  const engagementSalience = rounded(
    rawRelativePopularity / (1 + rawRelativePopularity),
  );
  const components = scoreComponents(candidate, engagementSalience);
  const engagementAttestation = {
    state: "observed" as const,
    authoritative: true as const,
    signalMethod: signal.method,
    providerSignal: signal.value,
    providerTopFloor: signal.topFloor,
    relativePopularity,
    engagementSalience,
    ...engagement.authority,
  };
  const admissionAttestation = buildAdmissionAttestation(candidate, signal);
  const tieBreak = {
    totalScore: components.total,
    engagementSalience,
    providerSignal: signal.value,
    publishedAt: candidate.publishedAt,
    canonicalIdentity: candidate.canonicalIdentity,
    candidateId: candidate.candidateId,
  };
  const digestInput = JSON.stringify({
    policyVersion: READER_PROMOTION_POLICY_V2_VERSION,
    candidateId: candidate.candidateId,
    canonicalIdentity: candidate.canonicalIdentity,
    provider: candidate.provider,
    signalMethod: signal.method,
    providerSignal: fixed(signal.value),
    providerTopFloor: fixed(signal.topFloor),
    topQualified,
    relativePopularity: fixed(relativePopularity),
    engagementSalience: fixed(engagementSalience),
    relevance: fixed(candidate.relevanceScore),
    evidenceQuality: fixed(candidate.evidenceQualityScore),
    integrity: fixed(candidate.integrityScore),
    freshness: fixed(candidate.freshnessScore),
    totalScore: fixed(components.total),
    publishedAt: candidate.publishedAt,
    metricsObservedAt: engagement.authority.metricsObservedAt,
    freshnessCutoffAt: engagement.authority.freshnessCutoffAt,
    authoritySource: engagement.authority.authoritySource,
    maximumAgeMs: engagement.authority.maximumAgeMs ?? null,
    regressionState: engagement.authority.regressionState,
  });

  return {
    admitted: true,
    policyVersion: READER_PROMOTION_POLICY_V2_VERSION,
    candidateId: candidate.candidateId,
    canonicalIdentity: candidate.canonicalIdentity,
    provider: candidate.provider,
    providerSignal: signal.value,
    providerTopFloor: signal.topFloor,
    topQualified,
    relativePopularity,
    components,
    admissionAttestation,
    engagementAttestation,
    tieBreak,
    digestInput,
  };
};

export const rankReaderPromotionV2 = (
  candidates: readonly ReaderPromotionV2Candidate[],
): ReaderPromotionV2Ranking => {
  const evaluations = candidates.map(evaluateReaderPromotionV2);
  const ranked = evaluations
    .filter((item): item is AdmittedReaderPromotionV2 => item.admitted)
    .sort(compareAdmitted);
  const rejectedItems = evaluations
    .filter((item): item is Extract<ReaderPromotionV2Evaluation, {
      readonly admitted: false;
    }> => !item.admitted)
    .sort((left, right) =>
      compareText(left.canonicalIdentity, right.canonicalIdentity) ||
      compareText(left.candidateId, right.candidateId),
    );
  return {
    policyVersion: READER_PROMOTION_POLICY_V2_VERSION,
    ranked,
    rejected: rejectedItems,
    orderedCandidateIds: ranked.map((item) => item.candidateId),
    orderedCanonicalIdentities: ranked.map((item) => item.canonicalIdentity),
    digestInputs: ranked.map((item) => item.digestInput),
  };
};

const hardAdmissionFailures = (
  candidate: ReaderPromotionV2Candidate,
): ReaderPromotionV2RejectionReason[] => {
  const reasons: ReaderPromotionV2RejectionReason[] = [];
  if (candidate.candidateId.trim().length === 0 ||
      candidate.canonicalIdentity.trim().length === 0) {
    reasons.push("identity_missing");
  }
  if (!isCanonicalUtcTimestamp(candidate.publishedAt)) {
    reasons.push("publication_time_malformed");
  }
  if (![candidate.relevanceScore, candidate.evidenceQualityScore,
    candidate.integrityScore, candidate.freshnessScore].every(isUnitScore)) {
    reasons.push("score_malformed");
    return reasons;
  }
  if (candidate.contentKind !== expectedContentKind[candidate.provider]) {
    reasons.push("content_kind_not_admitted");
  }
  if (!candidate.admission.relevanceFloorMet ||
      candidate.relevanceScore < 0.5) {
    reasons.push("relevance_floor_not_met");
  }
  if (!candidate.admission.qualityFloorMet ||
      candidate.evidenceQualityScore < 0.55) {
    reasons.push("quality_floor_not_met");
  }
  if (!candidate.admission.integrityFloorMet ||
      candidate.integrityScore < 0.5) {
    reasons.push("integrity_floor_not_met");
  }
  if (!candidate.admission.safetyFloorMet) {
    reasons.push("safety_floor_not_met");
  }
  if (!candidate.admission.freshnessFloorMet) {
    reasons.push("freshness_floor_not_met");
  }
  return reasons;
};

const engagementResult = (
  candidate: ReaderPromotionV2Candidate,
): EngagementResult => {
  if (candidate.engagement.state !== "observed") {
    return { reason: `engagement_${candidate.engagement.state}` };
  }
  if (!candidate.engagement.authoritative) {
    return { reason: "engagement_unauthoritative" };
  }
  if (candidate.engagement.metrics.provider !== candidate.provider) {
    return { reason: "engagement_conflict" };
  }
  const signal = providerSignal(candidate.engagement.metrics);
  if ("reason" in signal) return signal;
  const authority = evaluateReaderPromotionEngagementAuthority(candidate);
  if ("reason" in authority) return authority;
  if (candidate.provider === "github" &&
      candidate.engagement.metrics.provider === "github" &&
      candidate.engagement.metrics.checkedAt !== authority.metricsObservedAt) {
    return { reason: "engagement_conflict" };
  }
  return signal.signal.floorMet
    ? { ...signal, authority }
    : { reason: "provider_floor_not_met" };
};

const providerSignal = (
  metrics: ReaderPromotionV2ObservedMetrics,
): ProviderSignalResult => {
  switch (metrics.provider) {
    case "x": {
      if (!validCount(metrics.likes) || !validCount(metrics.reposts) ||
          (metrics.reportedSignal !== undefined &&
            !validCount(metrics.reportedSignal))) {
        return { reason: "engagement_malformed" };
      }
      const value = metrics.likes + 2 * metrics.reposts;
      if (metrics.reportedSignal !== undefined &&
          metrics.reportedSignal !== value) {
        return { reason: "engagement_conflict" };
      }
      return { signal: {
        value,
        method: "likes_plus_two_reposts",
        admissionFloor: 35,
        topFloor: 70,
        floorMet: value >= 35 &&
          (metrics.likes >= 15 || metrics.reposts >= 7),
      } };
    }
    case "reddit": {
      if (metrics.score === undefined && metrics.upvotes === undefined) {
        return { reason: "engagement_missing" };
      }
      if ((metrics.score !== undefined && !validCount(metrics.score)) ||
          (metrics.upvotes !== undefined && !validCount(metrics.upvotes)) ||
          (metrics.upvoteRatio !== undefined &&
            !isUnitScore(metrics.upvoteRatio))) {
        return { reason: "engagement_malformed" };
      }
      if (metrics.score !== undefined && metrics.upvotes !== undefined &&
          metrics.score !== metrics.upvotes) {
        return { reason: "engagement_conflict" };
      }
      const value = metrics.score ?? metrics.upvotes;
      if (value === undefined) return { reason: "engagement_missing" };
      return { signal: {
        value,
        method: "reddit_score_or_upvotes",
        admissionFloor: 25,
        topFloor: 50,
        floorMet: value >= 25 &&
          (metrics.upvoteRatio === undefined || metrics.upvoteRatio >= 0.55),
      } };
    }
    case "hacker_news":
      if (!validCount(metrics.points)) {
        return { reason: "engagement_malformed" };
      }
      return { signal: {
        value: metrics.points,
        method: "hacker_news_points",
        admissionFloor: 25,
        topFloor: 50,
        floorMet: metrics.points >= 25,
      } };
    case "github": {
      if (metrics.window !== "24h" || !validCount(metrics.starsDelta) ||
          !validCount(metrics.forksDelta) ||
          !isCanonicalUtcTimestamp(metrics.checkedAt)) {
        return { reason: "engagement_malformed" };
      }
      // A fork delta counts at the existing 2:1 fork-to-star floor ratio.
      const value = Math.max(metrics.starsDelta, metrics.forksDelta / 2);
      return { signal: {
        value,
        method: "max_stars_or_half_forks_24h",
        admissionFloor: 25,
        topFloor: 50,
        floorMet: metrics.starsDelta >= 25 || metrics.forksDelta >= 50,
      } };
    }
  }
};

const scoreComponents = (
  candidate: ReaderPromotionV2Candidate,
  engagementSalience: number,
): ReaderPromotionV2ScoreComponents => {
  const weightedEngagement = rounded(weights.engagement * engagementSalience);
  const weightedRelevance = rounded(
    weights.relevance * candidate.relevanceScore,
  );
  const weightedEvidenceQuality = rounded(
    weights.evidenceQuality * candidate.evidenceQualityScore,
  );
  const weightedIntegrity = rounded(
    weights.integrity * candidate.integrityScore,
  );
  const weightedFreshness = rounded(
    weights.freshness * candidate.freshnessScore,
  );
  return {
    engagementSalience,
    relevance: candidate.relevanceScore,
    evidenceQuality: candidate.evidenceQualityScore,
    integrity: candidate.integrityScore,
    freshness: candidate.freshnessScore,
    weightedEngagement,
    weightedRelevance,
    weightedEvidenceQuality,
    weightedIntegrity,
    weightedFreshness,
    total: rounded(weightedEngagement + weightedRelevance +
      weightedEvidenceQuality + weightedIntegrity + weightedFreshness),
  };
};

const buildAdmissionAttestation = (
  candidate: ReaderPromotionV2Candidate,
  signal: ProviderSignal,
): ReaderPromotionV2AdmissionAttestation => ({
  relevance: { minimum: 0.5, passed: true },
  quality: { minimum: 0.55, passed: true },
  integrity: { minimum: 0.5, passed: true },
  safety: { passed: candidate.admission.safetyFloorMet },
  freshness: { passed: candidate.admission.freshnessFloorMet },
  provider: {
    admissionFloor: signal.admissionFloor,
    topFloor: signal.topFloor,
    passed: signal.floorMet,
  },
});

const compareAdmitted = (
  left: AdmittedReaderPromotionV2,
  right: AdmittedReaderPromotionV2,
): number =>
  compareDescending(left.tieBreak.totalScore, right.tieBreak.totalScore) ||
  compareDescending(
    left.tieBreak.engagementSalience,
    right.tieBreak.engagementSalience,
  ) ||
  compareDescending(left.tieBreak.providerSignal, right.tieBreak.providerSignal) ||
  compareText(right.tieBreak.publishedAt, left.tieBreak.publishedAt) ||
  compareText(
    left.tieBreak.canonicalIdentity,
    right.tieBreak.canonicalIdentity,
  ) ||
  compareText(left.tieBreak.candidateId, right.tieBreak.candidateId);

const rejected = (
  candidate: ReaderPromotionV2Candidate,
  reasons: readonly ReaderPromotionV2RejectionReason[],
): ReaderPromotionV2Evaluation => ({
  admitted: false,
  policyVersion: READER_PROMOTION_POLICY_V2_VERSION,
  candidateId: candidate.candidateId,
  canonicalIdentity: candidate.canonicalIdentity,
  reasons: [...new Set(reasons)],
});

const validCount = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;
const isUnitScore = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 1;
const rounded = (value: number): number => Number(value.toFixed(12));
const fixed = (value: number): string => value.toFixed(12);
const compareDescending = (left: number, right: number): number =>
  left === right ? 0 : left > right ? -1 : 1;
const compareText = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;
const isCanonicalUtcTimestamp = (value: string): boolean => {
  const millis = Date.parse(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(millis) &&
    new Date(millis).toISOString() === value;
};
