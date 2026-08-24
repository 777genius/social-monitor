import {
  READER_POST_PROMOTION_POLICY_V1,
  READER_POST_PROMOTION_POLICY_VERSION,
  type ReaderPostContentKind,
  type ReaderPostPromotionDecision,
  type ReaderPostPromotionInput,
  type ReaderPostPromotionReason,
  type ReaderPostPromotionResult,
  type ReaderPostProvider,
  type ReaderPostProviderMetrics,
} from "./reader-post-promotion-policy-contract";

export * from "./reader-post-promotion-policy-contract";

type EngagementEvaluation = {
  readonly tier: "top" | "additional" | "none";
  readonly normalizedStrength: number;
  readonly reason?: ReaderPostPromotionReason;
};

export const evaluateReaderPostPromotion = (
  input: ReaderPostPromotionInput,
): ReaderPostPromotionResult => {
  const reject = (
    reason: ReaderPostPromotionReason,
  ): ReaderPostPromotionResult => result(input, "reject", reason);
  const provider = readerPostProviderFamily(input.provider);
  if (provider === undefined) return reject("unsupported_provider");
  if (isNonOriginalContent(input.contentKind)) {
    return reject("non_original_content");
  }
  if (input.contentKind !== READER_POST_PROMOTION_POLICY_V1.contentKinds[provider]) {
    return reject("wrong_content_kind");
  }

  const timeFailure = timestampFailure(input);
  if (timeFailure !== undefined) return reject(timeFailure);
  if (!input.freshnessValid) return reject("stale_evidence");
  if (!isUnitScore(input.qualityScore) || !isUnitScore(input.relevanceScore) ||
      !isUnitScore(input.integrityScore)) {
    return reject("invalid_quality_score");
  }
  if (!input.qualityValid) return reject("quality_gate_failed");
  if (!input.safetyValid) return reject("safety_gate_failed");
  if (!input.citationValid || input.citationId.trim().length === 0) {
    return reject("citation_gate_failed");
  }
  if (input.canonicalIdentity.trim().length === 0) {
    return reject("canonical_identity_missing");
  }

  const trustedSupport = isTrustedSupportAuthority(input);
  const relationDecision = classifyRelation(input);
  if (relationDecision === "invalid") return reject("invalid_relation");
  if (relationDecision === "context_related") {
    return result(input, "context_only", "related_topic_context");
  }
  if (relationDecision === "context_non_authoritative") {
    return result(input, "context_only", "non_authoritative_relation");
  }
  if (relationDecision === "support" && !trustedSupport) {
    return result(input, "context_only", "non_authoritative_relation");
  }
  let engagement: EngagementEvaluation | undefined;
  if (input.metricsState !== undefined && input.metricsState !== "observed") {
    return reject(metricStateReason(input.metricsState));
  }
  if (input.metrics === undefined) {
    return reject("metrics_missing");
  } else {
    if (input.metrics.provider !== provider) return reject("metrics_conflict");
    if (hasConflictingMetricFields(input.metrics)) {
      return reject("metrics_conflict");
    }
    engagement = evaluateEngagement(
      provider,
      canonicalPromotionMetrics(input.metrics),
      input.exactIngestionCutoff ?? input.ingestionCutoff,
      input.checkedAt,
    );
    if (engagement.reason !== undefined) return reject(engagement.reason);
  }

  if (engagement === undefined) return reject("metrics_missing");
  if (relationDecision === "support" && engagement.tier === "none") {
    return reject("engagement_floor_not_met");
  }
  if (engagement.tier === "none") {
    return reject("engagement_floor_not_met");
  }
  if (relationDecision === "support") {
    return result(
      input,
      "support_only",
      "authoritative_same_story_support",
      engagement.normalizedStrength,
      true,
    );
  }
  return result(
    input,
    engagement.tier === "top" ? "promote_top" : "promote_additional",
    engagement.tier === "top"
      ? "top_engagement_floor_met"
      : "additional_engagement_floor_met",
    engagement.normalizedStrength,
  );
};

const isTrustedSupportAuthority = (
  input: ReaderPostPromotionInput,
): boolean => input.authorityAttestation?.status === "attested" &&
  input.authorityAttestation.trusted &&
  input.authorityAttestation.attestedBy === "source_catalog";

const result = (
  input: ReaderPostPromotionInput,
  decision: ReaderPostPromotionDecision,
  reason: ReaderPostPromotionReason,
  normalizedStrength = 0,
  authoritativeSameStory = false,
): ReaderPostPromotionResult => ({
  policyVersion: READER_POST_PROMOTION_POLICY_VERSION,
  candidateId: input.candidateId,
  canonicalIdentity: input.canonicalIdentity.trim(),
  decision,
  reason,
  normalizedStrength,
  authoritativeSameStory,
});

export const readerPostProviderFamily = (
  provider: string,
): ReaderPostProvider | undefined => {
  const normalized = provider.trim().toLowerCase();
  for (const family of Object.keys(
    READER_POST_PROMOTION_POLICY_V1.providerAliases,
  ) as ReaderPostProvider[]) {
    if ((READER_POST_PROMOTION_POLICY_V1.providerAliases[family] as
      readonly string[]).includes(normalized)) return family;
  }
  return undefined;
};

const isNonOriginalContent = (kind: ReaderPostContentKind): boolean =>
  kind === "comment" || kind === "reply" || kind === "quote" ||
  kind === "github_trending";

const isUnitScore = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 1;

const metricStateReason = (
  state: NonNullable<ReaderPostPromotionInput["metricsState"]>,
): ReaderPostPromotionReason => state === "missing"
  ? "metrics_missing"
  : state === "conflict"
    ? "metrics_conflict"
    : "metrics_malformed";

const timestampFailure = (
  input: ReaderPostPromotionInput,
): ReaderPostPromotionReason | undefined => {
  const publishedAt = readerPostPromotionTimestampMicros(
    input.exactPublishedAt ?? input.publishedAt,
  );
  const observedAt = readerPostPromotionTimestampMicros(input.exactObservedAt ?? input.observedAt);
  const periodStart = readerPostPromotionTimestampMicros(input.exactPeriodStart ?? input.periodStart);
  const periodEnd = readerPostPromotionTimestampMicros(input.exactPeriodEnd ?? input.periodEnd);
  const cutoff = readerPostPromotionTimestampMicros(
    input.exactIngestionCutoff ?? input.ingestionCutoff,
  );
  if (publishedAt === undefined || periodStart === undefined ||
      periodEnd === undefined || periodStart >= periodEnd) {
    return "invalid_publication_time";
  }
  if (publishedAt < periodStart || publishedAt >= periodEnd) {
    return "outside_period";
  }
  if (observedAt === undefined || cutoff === undefined ||
      observedAt < publishedAt) {
    return "invalid_observation_time";
  }
  return observedAt > cutoff ? "observed_after_cutoff" : undefined;
};

/** Exact UTC comparator for PostgreSQL timestamptz(6) promotion boundaries. */
export const readerPostPromotionTimestampMicros = (
  value: Date | string,
): bigint | undefined => {
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? BigInt(millis) * 1_000n : undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/u
    .exec(value);
  if (match === null) return undefined;
  const millis = Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]), 0,
  );
  if (!Number.isFinite(millis)) return undefined;
  const canonicalSecond = new Date(millis).toISOString().slice(0, 19);
  if (canonicalSecond !== value.slice(0, 19)) return undefined;
  return BigInt(millis) * 1_000n + BigInt(match[7]!);
};

const classifyRelation = (
  input: ReaderPostPromotionInput,
): "lead" | "support" | "context_related" |
  "context_non_authoritative" | "invalid" => {
  const relation = input.relation;
  if (relation === undefined) return "lead";
  if (relation.targetCanonicalIdentity.trim().length === 0 ||
      !isUnitScore(relation.confidence)) return "invalid";
  if (relation.kind !== "same_story") return relation.kind === "related_topic"
    ? "context_related"
    : "context_non_authoritative";
  const approvedHighConfidence = relation.approved &&
    relation.confidence >= READER_POST_PROMOTION_POLICY_V1.sameStoryConfidenceMinimum;
  return approvedHighConfidence
    ? "support"
    : "context_non_authoritative";
};

const evaluateEngagement = (
  provider: ReaderPostProvider,
  metrics: ReaderPostProviderMetrics,
  cutoff: Date | string,
  checkedAt: Date | undefined,
): EngagementEvaluation => {
  if (provider === "x" && metrics.provider === "x") return evaluateX(metrics);
  if (provider === "reddit" && metrics.provider === "reddit") {
    return evaluateReddit(metrics);
  }
  if (provider === "hacker_news" && metrics.provider === "hacker_news") {
    return evaluateHackerNews(metrics);
  }
  if (provider === "github_radar" && metrics.provider === "github_radar") {
    return evaluateGitHubRadar(metrics, cutoff, checkedAt);
  }
  return { tier: "none", normalizedStrength: 0, reason: "metrics_conflict" };
};

const validCount = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value) && value >= 0;

const hasConflictingMetricFields = (
  metrics: ReaderPostProviderMetrics,
): boolean => Object.keys(metrics).some(
  (key) => !(READER_POST_PROMOTION_POLICY_V1.metricFields[metrics.provider] as
    readonly string[]).includes(key) &&
    !(FORBIDDEN_SECONDARY_METRIC_FIELDS[metrics.provider] as readonly string[])
      .includes(key),
);

const FORBIDDEN_SECONDARY_METRIC_FIELDS = Object.freeze({
  x: Object.freeze(["replies", "quotes", "bookmarks", "impressions"]),
  reddit: Object.freeze(["comments", "numComments"]),
  hacker_news: Object.freeze(["comments"]),
  github_radar: Object.freeze([]),
} satisfies Readonly<Record<ReaderPostProvider, readonly string[]>>);

export const canonicalReaderPostPromotionInput = (
  input: ReaderPostPromotionInput,
): ReaderPostPromotionInput => input.metrics === undefined
  ? input
  : { ...input, metrics: canonicalPromotionMetrics(input.metrics) };

const canonicalPromotionMetrics = (
  metrics: ReaderPostProviderMetrics,
): ReaderPostProviderMetrics => {
  switch (metrics.provider) {
    case "x": return {
      provider: "x",
      likes: metrics.likes,
      reposts: metrics.reposts,
      weightedScore: metrics.weightedScore,
    };
    case "reddit": return {
      provider: "reddit",
      score: metrics.score,
      ...(metrics.upvoteRatio === undefined
        ? {}
        : { upvoteRatio: metrics.upvoteRatio }),
    };
    case "hacker_news": return {
      provider: "hacker_news",
      points: metrics.points,
    };
    case "github_radar": return {
      provider: "github_radar",
      snapshotKind: metrics.snapshotKind,
      windowStartedAt: metrics.windowStartedAt,
      windowEndedAt: metrics.windowEndedAt,
      starsDelta: metrics.starsDelta,
      forksDelta: metrics.forksDelta,
    };
  }
};

const evaluateX = (
  metrics: Extract<ReaderPostProviderMetrics, { provider: "x" }>,
): EngagementEvaluation => {
  if (metrics.likes === undefined || metrics.reposts === undefined ||
      metrics.weightedScore === undefined) {
    return missingMetrics();
  }
  if (!validCount(metrics.likes) || !validCount(metrics.reposts) ||
      !validCount(metrics.weightedScore)) {
    return malformedMetrics();
  }
  const expectedWeighted = metrics.likes + 2 * metrics.reposts;
  if (metrics.weightedScore !== expectedWeighted) return conflictMetrics();
  const floors = READER_POST_PROMOTION_POLICY_V1.floors.x;
  const tier = metrics.weightedScore >= floors.top.weighted &&
      (metrics.likes >= floors.top.likes || metrics.reposts >= floors.top.reposts)
    ? "top"
    : metrics.weightedScore >= floors.additional.weighted &&
        (metrics.likes >= floors.additional.likes ||
          metrics.reposts >= floors.additional.reposts)
      ? "additional"
      : "none";
  return {
    tier,
    normalizedStrength: Math.min(1, metrics.weightedScore / floors.top.weighted),
  };
};

const evaluateReddit = (
  metrics: Extract<ReaderPostProviderMetrics, { provider: "reddit" }>,
): EngagementEvaluation => {
  if (metrics.score === undefined) {
    return missingMetrics();
  }
  if (
    !validCount(metrics.score) ||
    (metrics.upvoteRatio !== undefined && !isUnitScore(metrics.upvoteRatio))) {
    return malformedMetrics();
  }
  const floors = READER_POST_PROMOTION_POLICY_V1.floors.reddit;
  const trustedRatio = metrics.upvoteRatio;
  const tier = metrics.score >= floors.top.score &&
      (trustedRatio === undefined || trustedRatio >= floors.top.trustedRatio)
    ? "top"
    : metrics.score >= floors.additional.score &&
        (trustedRatio === undefined ||
          trustedRatio >= floors.additional.trustedRatio)
      ? "additional"
      : "none";
  return { tier, normalizedStrength: Math.min(1, metrics.score / floors.top.score) };
};

const evaluateHackerNews = (
  metrics: Extract<ReaderPostProviderMetrics, { provider: "hacker_news" }>,
): EngagementEvaluation => {
  if (metrics.points === undefined) return missingMetrics();
  if (!validCount(metrics.points)) return malformedMetrics();
  const floors = READER_POST_PROMOTION_POLICY_V1.floors.hackerNews;
  const tier = metrics.points >= floors.topPoints
    ? "top"
    : metrics.points >= floors.additionalPoints
      ? "additional"
      : "none";
  return { tier, normalizedStrength: Math.min(1, metrics.points / floors.topPoints) };
};

const evaluateGitHubRadar = (
  metrics: Extract<ReaderPostProviderMetrics, { provider: "github_radar" }>,
  cutoff: Date | string,
  checkedAt: Date | undefined,
): EngagementEvaluation => {
  if (metrics.snapshotKind !== "repository_growth") return malformedMetrics();
  const start = readerPostPromotionTimestampMicros(metrics.windowStartedAt);
  const end = readerPostPromotionTimestampMicros(metrics.windowEndedAt);
  const checked = checkedAt === undefined
    ? undefined
    : readerPostPromotionTimestampMicros(checkedAt);
  const cutoffMicros = readerPostPromotionTimestampMicros(cutoff);
  const duration = start === undefined || end === undefined
    ? undefined
    : end - start;
  const validDuration = duration === 24n * 3_600_000_000n ||
    duration === 48n * 3_600_000_000n;
  if (start === undefined || end === undefined || start >= end ||
      checked === undefined || cutoffMicros === undefined || end !== checked ||
      end > cutoffMicros || !validDuration) {
    return malformedMetrics();
  }
  if (!validCount(metrics.starsDelta) || !validCount(metrics.forksDelta)) {
    return malformedMetrics();
  }
  const floors = READER_POST_PROMOTION_POLICY_V1.floors.githubRadar;
  const top = metrics.starsDelta >= floors.top.starsDelta ||
    metrics.forksDelta >= floors.top.forksDelta;
  const additional = metrics.starsDelta >= floors.additional.starsDelta ||
    metrics.forksDelta >= floors.additional.forksDelta;
  const normalizedStrength = Math.max(
    metrics.starsDelta / floors.top.starsDelta,
    metrics.forksDelta / floors.top.forksDelta,
  );
  return {
    tier: top ? "top" : additional ? "additional" : "none",
    normalizedStrength: Math.min(1, normalizedStrength),
  };
};

const malformedMetrics = (): EngagementEvaluation => ({
  tier: "none",
  normalizedStrength: 0,
  reason: "metrics_malformed",
});

const conflictMetrics = (): EngagementEvaluation => ({
  tier: "none",
  normalizedStrength: 0,
  reason: "metrics_conflict",
});

const missingMetrics = (): EngagementEvaluation => ({
  tier: "none",
  normalizedStrength: 0,
  reason: "metrics_missing",
});
