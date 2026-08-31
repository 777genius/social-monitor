import {
  classifyFeedPromotionEligibility,
  type FeedPromotionCanonicalMetrics,
  type FeedPromotionEligibility,
  type FeedPromotionMetricRegressionState,
} from "@social-monitor/feed/domain";
import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";

import type {
  SummaryEvidenceContentQuality,
  SummaryEvidencePromotionFacts,
  SummaryEvidencePromotionMetrics,
} from "../../domain";

export const readerPostPromotionFacts = (params: {
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly providerMetadata?: JsonObject;
  readonly contentQuality?: SummaryEvidenceContentQuality;
  readonly safetyStatus: "allowed" | "sanitized" | "blocked";
  readonly publishedAt?: Date;
  readonly observedAt?: Date;
  readonly ingestionCutoff?: Date;
  readonly exactPublishedAt?: string;
  readonly exactObservedAt?: string;
  readonly canonicalPromotion?: FeedPromotionEligibility;
  readonly engagementAuthority?: {
    readonly observedAt: string;
    readonly regressionState: FeedPromotionMetricRegressionState;
  };
}): SummaryEvidencePromotionFacts => {
  const eligibility = params.canonicalPromotion ??
    classifyFeedPromotionEligibility(params);
  const providerMetrics = eligibility.eligible ? eligibility.metrics : undefined;
  const metricsState = eligibility.metricsState;
  const metrics = metricsState === "observed"
    ? promotionMetrics(providerMetrics)
    : undefined;
  const checkedAt = providerMetrics?.kind === "github_repository" &&
      providerMetrics.checkedAt !== undefined
    ? validDate(providerMetrics.checkedAt)
    : undefined;

  const freshnessProvenance = promotionFreshnessProvenance(params);
  const engagementAuthority = promotionEngagementAuthority(
    params.engagementAuthority,
  );
  return {
    contentKind: eligibility.eligible
      ? eligibility.contentKind
      : eligibility.reason === "appendix_only" ||
          eligibility.reason === "forbidden_content_kind"
        ? promotionContentKindFromMetadata(params.providerMetadata)
        : "unknown",
    canonicalIdentity: canonicalPromotionIdentity(params.canonicalUrl),
    ...(checkedAt === undefined ? {} : { checkedAt }),
    ...(engagementAuthority === undefined ? {} : { engagementAuthority }),
    ...(!eligibility.eligible || eligibility.authorityAttestation === undefined
      ? {}
      : { authorityAttestation: eligibility.authorityAttestation }),
    safetyValid: params.safetyStatus !== "blocked",
    freshnessValid: freshnessProvenance.status === "observed" &&
      comparePromotionTimestamp(
        freshnessProvenance.exactPublishedAt ??
          exactTimestamp(freshnessProvenance.publishedAt),
        freshnessProvenance.exactObservedAt ??
          exactTimestamp(freshnessProvenance.observedAt),
      ) <= 0 &&
      comparePromotionTimestamp(
        freshnessProvenance.exactObservedAt ??
          exactTimestamp(freshnessProvenance.observedAt),
        freshnessProvenance.exactIngestionCutoff ??
          exactTimestamp(freshnessProvenance.ingestionCutoff),
      ) <= 0,
    freshnessProvenance,
    metricsState,
    ...(metrics === undefined ? {} : { metrics }),
  };
};

const promotionEngagementAuthority = (
  authority: {
    readonly observedAt: string;
    readonly regressionState: FeedPromotionMetricRegressionState;
  } | undefined,
): SummaryEvidencePromotionFacts["engagementAuthority"] => {
  if (authority === undefined || ![
    "stable",
    "confirmed_correction",
    "unresolved_regression",
  ].includes(authority.regressionState)) return undefined;
  const observedAt = validDate(authority.observedAt);
  return observedAt === undefined ? undefined : {
    observedAt,
    regressionState: authority.regressionState,
  };
};

const promotionFreshnessProvenance = (params: {
  readonly publishedAt?: Date;
  readonly observedAt?: Date;
  readonly ingestionCutoff?: Date;
  readonly exactPublishedAt?: string;
  readonly exactObservedAt?: string;
}): NonNullable<SummaryEvidencePromotionFacts["freshnessProvenance"]> => {
  if (params.publishedAt === undefined || params.observedAt === undefined ||
      params.ingestionCutoff === undefined ||
      !Number.isFinite(params.publishedAt.getTime()) ||
      !Number.isFinite(params.observedAt.getTime()) ||
      !Number.isFinite(params.ingestionCutoff.getTime())) {
    return { status: "unknown" };
  }
  return {
    status: "observed",
    publishedAt: new Date(params.publishedAt),
    observedAt: new Date(params.observedAt),
    ingestionCutoff: new Date(params.ingestionCutoff),
    ...(params.exactPublishedAt === undefined
      ? {}
      : { exactPublishedAt: params.exactPublishedAt }),
    ...(params.exactObservedAt === undefined
      ? {}
      : { exactObservedAt: params.exactObservedAt }),
    exactIngestionCutoff: exactTimestamp(params.ingestionCutoff),
  };
};

const exactTimestamp = (value: Date): string =>
  value.toISOString().replace(/\.(\d{3})Z$/u, ".$1" + "000Z");

const comparePromotionTimestamp = (left: string, right: string): number =>
  left.localeCompare(right, "en-US");

const promotionContentKindFromMetadata = (
  metadata: JsonObject | undefined,
): SummaryEvidencePromotionFacts["contentKind"] => {
  switch (metadata?.kind) {
    case "reddit_post":
      return "original_post";
    case "reddit_comment":
    case "hacker_news_comment":
      return metadata.role === "reply" ? "reply" : "comment";
    case "hacker_news_story":
      return "story";
    case "github_repository_trend":
      return "repository";
    case "github_trending_page_repository":
      return "github_trending";
    case "x_post":
    case "twitter_post":
      return xContentKind(metadata.contentKind);
    default:
      return "unknown";
  }
};

const xContentKind = (
  value: JsonValue | undefined,
): SummaryEvidencePromotionFacts["contentKind"] => {
  switch (value) {
    case "original_post":
    case "reply":
    case "quote":
      return value;
    default:
      return "unknown";
  }
};

const promotionMetrics = (
  metrics: FeedPromotionCanonicalMetrics | undefined,
): SummaryEvidencePromotionMetrics | undefined => {
  switch (metrics?.kind) {
    case "x_post":
      return metrics.likes === undefined || metrics.reposts === undefined
        ? undefined
        : {
            provider: "x",
            likes: metrics.likes,
            reposts: metrics.reposts,
            weightedScore: metrics.likes + 2 * metrics.reposts,
          };
    case "reddit_post":
      return {
        provider: "reddit",
        score: metrics.score,
        ...(metrics.upvoteRatio === undefined
          ? {}
          : { upvoteRatio: metrics.upvoteRatio }),
      };
    case "hacker_news_story":
      return { provider: "hacker_news", points: metrics.points };
    case "github_repository":
      return githubPromotionMetrics(metrics);
    case undefined:
      return undefined;
  }
};

const githubPromotionMetrics = (
  metrics: Extract<FeedPromotionCanonicalMetrics, { readonly kind: "github_repository" }>,
): SummaryEvidencePromotionMetrics | undefined => {
  const checkedAt = metrics.checkedAt === undefined
    ? undefined
    : validDate(metrics.checkedAt);
  const duration = metrics.trendingDelta.window;
  if (checkedAt === undefined || (duration !== "24h" && duration !== "48h")) {
    return undefined;
  }
  const durationHours = duration === "24h" ? 24 : 48;
  const matching = metrics.trendDeltas.filter((delta) => delta.window === duration);
  const matchingForks = metrics.forkTrendDeltas.filter(
    (delta) => delta.window === duration,
  );
  if (matching.length !== 1 || matching[0]?.value === undefined ||
      matching[0].value !== metrics.trendingDelta.value ||
      matchingForks.length !== 1 || matchingForks[0]?.value === undefined) {
    return undefined;
  }
  return {
    provider: "github_radar",
    snapshotKind: "repository_growth",
    windowStartedAt: new Date(checkedAt.getTime() - durationHours * 3_600_000),
    windowEndedAt: checkedAt,
    starsDelta: matching[0].value,
    forksDelta: matchingForks[0].value,
  };
};

const validDate = (value: string): Date | undefined => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

const canonicalPromotionIdentity = (value: string): string => {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return `url:${url.toString()}`;
  } catch {
    return "";
  }
};
