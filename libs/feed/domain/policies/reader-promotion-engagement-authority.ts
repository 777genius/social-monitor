import {
  READER_PROMOTION_SOCIAL_METRIC_MAX_AGE_MS,
  type ReaderPromotionV2Candidate,
  type ReaderPromotionV2RejectionReason,
} from "../value-objects/reader-promotion-v2-candidate";

export type AdmittedReaderPromotionEngagementAuthority = {
  readonly authoritySource: "durable_projection" | "github_checked_at";
  readonly metricsObservedAt: string;
  readonly freshnessCutoffAt: string;
  readonly maximumAgeMs?: number;
  readonly regressionState: "stable" | "confirmed_correction";
};

export const evaluateReaderPromotionEngagementAuthority = (
  candidate: ReaderPromotionV2Candidate,
): AdmittedReaderPromotionEngagementAuthority | {
  readonly reason: ReaderPromotionV2RejectionReason;
} => {
  if (candidate.engagement.state !== "observed" ||
      candidate.engagement.authority === undefined) {
    return { reason: "engagement_authority_missing" };
  }
  const authority = candidate.engagement.authority;
  const observedAt = canonicalUtcMillis(authority.observedAt);
  const cutoffAt = canonicalUtcMillis(candidate.engagementCutoffAt);
  if (observedAt === undefined || cutoffAt === undefined) {
    return { reason: "engagement_authority_malformed" };
  }
  if (observedAt > cutoffAt) {
    return { reason: "engagement_observed_after_cutoff" };
  }
  if (authority.regressionState === "unresolved_regression") {
    return { reason: "engagement_regression_unresolved" };
  }
  if (candidate.provider === "github") {
    if (authority.source !== "github_checked_at" ||
        authority.regressionState !== "stable") {
      return { reason: "engagement_authority_malformed" };
    }
    return admitted(authority, candidate.engagementCutoffAt);
  }
  if (authority.source !== "durable_projection") {
    return { reason: "engagement_authority_malformed" };
  }
  if (cutoffAt - observedAt > READER_PROMOTION_SOCIAL_METRIC_MAX_AGE_MS) {
    return { reason: "engagement_stale" };
  }
  return admitted(
    authority,
    candidate.engagementCutoffAt,
    READER_PROMOTION_SOCIAL_METRIC_MAX_AGE_MS,
  );
};

const admitted = (
  authority: NonNullable<Extract<
    ReaderPromotionV2Candidate["engagement"],
    { readonly state: "observed" }
  >["authority"]>,
  freshnessCutoffAt: string,
  maximumAgeMs?: number,
): AdmittedReaderPromotionEngagementAuthority => ({
  authoritySource: authority.source,
  metricsObservedAt: authority.observedAt,
  freshnessCutoffAt,
  ...(maximumAgeMs === undefined ? {} : { maximumAgeMs }),
  regressionState: authority.regressionState as
    "stable" | "confirmed_correction",
});

const canonicalUtcMillis = (value: string): number | undefined => {
  const millis = Date.parse(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(millis) && new Date(millis).toISOString() === value
    ? millis
    : undefined;
};
