import type {
  ReaderPromotionV2Candidate,
  ReaderPromotionV2HardAdmission,
} from "../value-objects/reader-promotion-v2-candidate";

export const passingReaderPromotionAdmission:
ReaderPromotionV2HardAdmission = Object.freeze({
  relevanceFloorMet: true,
  qualityFloorMet: true,
  integrityFloorMet: true,
  safetyFloorMet: true,
  freshnessFloorMet: true,
});

const rankingInputs = Object.freeze({
  publishedAt: "2026-08-29T12:00:00.000Z",
  engagementCutoffAt: "2026-08-29T18:00:00.000Z",
  admission: passingReaderPromotionAdmission,
  relevanceScore: 0.9,
  evidenceQualityScore: 0.8,
  integrityScore: 0.85,
  freshnessScore: 0.75,
});

export const xPromotionCandidate = (params: {
  readonly candidateId: string;
  readonly likes: number;
  readonly reposts?: number;
  readonly canonicalIdentity?: string;
}): ReaderPromotionV2Candidate => ({
  ...rankingInputs,
  candidateId: params.candidateId,
  canonicalIdentity:
    params.canonicalIdentity ?? `fixture:x:${params.candidateId}`,
  provider: "x",
  contentKind: "original_post",
  engagement: {
    state: "observed",
    authoritative: true,
    authority: socialMetricAuthority(),
    metrics: {
      provider: "x",
      likes: params.likes,
      reposts: params.reposts ?? 0,
    },
  },
});

export const redditPromotionCandidate = (): ReaderPromotionV2Candidate => ({
  ...rankingInputs,
  candidateId: "fixture-reddit-01",
  canonicalIdentity: "fixture:reddit:01",
  provider: "reddit",
  contentKind: "original_post",
  engagement: {
    state: "observed",
    authoritative: true,
    authority: socialMetricAuthority(),
    metrics: {
      provider: "reddit",
      score: 64,
      upvotes: 64,
      upvoteRatio: 0.81,
    },
  },
});

export const hackerNewsPromotionCandidate =
(): ReaderPromotionV2Candidate => ({
  ...rankingInputs,
  candidateId: "fixture-hn-01",
  canonicalIdentity: "fixture:hacker-news:01",
  provider: "hacker_news",
  contentKind: "story",
  engagement: {
    state: "observed",
    authoritative: true,
    authority: socialMetricAuthority(),
    metrics: { provider: "hacker_news", points: 73 },
  },
});

export const githubPromotionCandidate = (): ReaderPromotionV2Candidate => ({
  ...rankingInputs,
  candidateId: "fixture-github-01",
  canonicalIdentity: "fixture:github:01",
  provider: "github",
  contentKind: "repository",
  engagement: {
    state: "observed",
    authoritative: true,
    authority: {
      source: "github_checked_at",
      observedAt: "2026-08-29T17:00:00.000Z",
      regressionState: "stable",
    },
    metrics: {
      provider: "github",
      window: "24h",
      checkedAt: "2026-08-29T17:00:00.000Z",
      starsDelta: 38,
      forksDelta: 12,
    },
  },
});

const socialMetricAuthority = () => ({
  source: "durable_projection" as const,
  observedAt: "2026-08-29T17:00:00.000Z",
  regressionState: "stable" as const,
});
