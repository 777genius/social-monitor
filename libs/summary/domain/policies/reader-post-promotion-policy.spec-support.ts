import type {
  ReaderPostPromotionInput,
  ReaderPostProviderMetrics,
} from "./reader-post-promotion-policy";

export const promotionInput = (
  overrides: Partial<ReaderPostPromotionInput> = {},
): ReaderPostPromotionInput => ({
  candidateId: "candidate-x",
  provider: "x",
  contentKind: "original_post",
  canonicalIdentity: "story:cursor-release",
  citationId: "citation-x",
  publishedAt: new Date("2026-08-14T12:00:00.000Z"),
  observedAt: new Date("2026-08-14T12:05:00.000Z"),
  checkedAt: new Date("2026-08-15T00:00:00.000Z"),
  periodStart: new Date("2026-08-14T00:00:00.000Z"),
  periodEnd: new Date("2026-08-15T00:00:00.000Z"),
  ingestionCutoff: new Date("2026-08-15T01:00:00.000Z"),
  freshnessValid: true,
  qualityScore: 0.8,
  relevanceScore: 0.8,
  integrityScore: 0.8,
  qualityValid: true,
  safetyValid: true,
  citationValid: true,
  metricsState: "observed",
  metrics: { provider: "x", likes: 30, reposts: 20, weightedScore: 70 },
  whyImportant: "Cursor released a material product update.",
  ...overrides,
});

export const attestedOfficialAuthority = {
  status: "attested",
  official: true,
  trusted: true,
  attestedBy: "source_catalog",
} as const;

export const attestedTrustedAuthority = {
  status: "attested",
  official: false,
  trusted: true,
  attestedBy: "source_catalog",
} as const;

export const xMetrics = (
  likes: number,
  reposts: number,
  weightedScore = likes + 2 * reposts,
): ReaderPostProviderMetrics => ({ provider: "x", likes, reposts, weightedScore });

export const redditMetrics = (
  score: number,
  upvoteRatio?: number,
  comments?: number,
): ReaderPostProviderMetrics => ({
  provider: "reddit",
  score,
  ...(comments === undefined ? {} : { comments }),
  ...(upvoteRatio === undefined ? {} : { upvoteRatio }),
} as unknown as ReaderPostProviderMetrics);

export const hackerNewsMetrics = (
  points: number,
): ReaderPostProviderMetrics => ({ provider: "hacker_news", points });

export const githubRadarMetrics = (params: {
  readonly hours: 24 | 48;
  readonly delta?: number;
  readonly starsDelta?: number;
  readonly forksDelta?: number;
}): ReaderPostProviderMetrics => ({
  provider: "github_radar",
  snapshotKind: "repository_growth",
  windowStartedAt: new Date(
    Date.parse("2026-08-15T00:00:00.000Z") - params.hours * 3_600_000,
  ),
  windowEndedAt: new Date("2026-08-15T00:00:00.000Z"),
  starsDelta: params.starsDelta ?? (params.hours === 24 ? params.delta ?? 0 : 0),
  forksDelta: params.forksDelta ?? (params.hours === 48 ? params.delta ?? 0 : 0),
});
