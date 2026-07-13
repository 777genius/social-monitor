import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import { STORY_RANKING_POLICY_V1 } from "./story-ranking-policy";
import {
  sharedStoryTopicTokenCount,
  storyPrimaryClaimFacet,
  storyTopicEventTokens,
  storyTopicSimilarity,
  storyTopicSpecificProductTokens,
  storyTopicTokens,
  type StoryPrimaryClaimFacet,
} from "../services/story-topic-tokenizer";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";
import {
  topReadPrimaryMinimumForLimit,
  topReadProviderCapForLimit,
} from "./top-read-provider-diversity-policy";
import {
  isFallbackReaderReason,
  isReaderTitleReasonDuplicate,
  isUnpolishedReaderTitle,
} from "./reader-summary-reader-facing-text-policy";
import {
  compareReaderSummaryEditorialPriority,
  type ReaderSummaryEditorialPriorityProfile,
} from "./reader-summary-editorial-priority-policy";

export type RenderedTopReadCandidate = {
  readonly story: TopReadCandidate;
  readonly topRead: TopRead;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly editorialPriority?: ReaderSummaryEditorialPriorityProfile;
};

export type ReaderFacingTopReadQualityInput = Pick<
  TopRead,
  | "title"
  | "reason"
  | "providerKey"
  | "canonicalUrl"
  | "signalScore"
  | "confidence"
  | "confirmedProviderKeys"
>;

export const selectRenderedTopReadCandidates = (params: {
  readonly candidates: readonly RenderedTopReadCandidate[];
  readonly sourceMix: readonly SourceMixEntry[];
  readonly limit: number;
}): readonly RenderedTopReadCandidate[] => {
  const limit = normalizeLimit(params.limit);
  const activeProviders = activeProviderKeys(params);
  const providerCap = topReadProviderCapForLimit({
    limit,
    activeProviderCount: activeProviders.length,
    primaryMinimum: topReadPrimaryMinimumForLimit(limit),
  });
  const selected: RenderedTopReadCandidate[] = [];
  const selectedStoryIds = new Set<string>();
  const providerCounts = new Map<string, number>();
  const pool = rankedCandidatePool(
    qualityCandidatePool(params.candidates, limit),
  );
  const fallbackShouldRespectProviderCap =
    compactUnique(pool.map((candidate) => candidate.topRead.providerKey))
      .length > 1;
  const select = (candidate: RenderedTopReadCandidate): void => {
    selected.push(candidate);
    selectedStoryIds.add(candidate.story.storyClusterId);
    const providerKey = candidate.topRead.providerKey;
    providerCounts.set(providerKey, (providerCounts.get(providerKey) ?? 0) + 1);
  };

  for (const candidate of pool) {
    if (selected.length >= limit) {
      break;
    }
    if (!isReaderFacingQualityTopRead(candidate.topRead)) {
      continue;
    }
    if (
      selected.length < editorialDiversityWindow &&
      selected.some((item) => areEditorialNearDuplicates(item, candidate))
    ) {
      continue;
    }
    const providerKey = candidate.topRead.providerKey;
    const cap = socialNewsProviderKeys.has(providerKey) ? providerCap : limit;
    if ((providerCounts.get(providerKey) ?? 0) >= cap) {
      continue;
    }
    select(candidate);
  }

  for (const candidate of pool) {
    if (selected.length >= limit) {
      break;
    }
    if (
      selectedStoryIds.has(candidate.story.storyClusterId) ||
      !isReaderFacingQualityTopRead(candidate.topRead)
    ) {
      continue;
    }
    const providerKey = candidate.topRead.providerKey;
    if (
      fallbackShouldRespectProviderCap &&
      socialNewsProviderKeys.has(providerKey) &&
      (providerCounts.get(providerKey) ?? 0) >= providerCap
    ) {
      continue;
    }
    select(candidate);
  }

  for (const candidate of pool) {
    if (selected.length >= limit) {
      break;
    }
    if (
      selectedStoryIds.has(candidate.story.storyClusterId) ||
      !isReaderFacingQualityTopRead(candidate.topRead)
    ) {
      continue;
    }
    const providerKey = candidate.topRead.providerKey;
    const refillCap = socialNewsProviderKeys.has(providerKey)
      ? maxRenderedSocialProviderCount
      : limit;
    if ((providerCounts.get(providerKey) ?? 0) >= refillCap) {
      continue;
    }
    select(candidate);
  }

  return selected;
};

const areEditorialNearDuplicates = (
  left: RenderedTopReadCandidate,
  right: RenderedTopReadCandidate,
): boolean => {
  const leftProfile = editorialStoryProfile(left);
  const rightProfile = editorialStoryProfile(right);
  if (
    leftProfile === undefined ||
    rightProfile === undefined ||
    !claimFacetsAreCompatible(leftProfile.claimFacets, rightProfile.claimFacets)
  ) {
    return false;
  }
  const sharedProductTokens = sharedStoryTopicTokenCount(
    leftProfile.productTokens,
    rightProfile.productTokens,
  );
  if (sharedProductTokens === 0) {
    return false;
  }
  const hasEventContext =
    leftProfile.eventTokens.length > 0 || rightProfile.eventTokens.length > 0;
  if (
    hasEventContext &&
    sharedStoryTopicTokenCount(
      leftProfile.eventTokens,
      rightProfile.eventTokens,
    ) === 0
  ) {
    return false;
  }
  const sharedTopicTokens = sharedStoryTopicTokenCount(
    leftProfile.topicTokens,
    rightProfile.topicTokens,
  );

  return (
    sharedTopicTokens >= minimumSharedEditorialTokens &&
    storyTopicSimilarity(leftProfile.topicTokens, rightProfile.topicTokens) >=
      minimumEditorialTopicSimilarity
  );
};

type EditorialStoryProfile = {
  readonly topicTokens: readonly string[];
  readonly productTokens: readonly string[];
  readonly eventTokens: readonly string[];
  readonly claimFacets: readonly StoryPrimaryClaimFacet[];
};

const editorialStoryProfile = (
  candidate: RenderedTopReadCandidate,
): EditorialStoryProfile | undefined => {
  if (candidate.evidence.length === 0) {
    return undefined;
  }
  const topicTokens = compactUnique(
    candidate.evidence.flatMap((item) =>
      storyTopicTokens(item, STORY_RANKING_POLICY_V1),
    ),
  );

  return {
    topicTokens,
    productTokens: compactUnique(storyTopicSpecificProductTokens(topicTokens)),
    eventTokens: compactUnique(storyTopicEventTokens(topicTokens)),
    claimFacets: uniqueClaimFacets(candidate.evidence),
  };
};

const uniqueClaimFacets = (
  evidence: readonly SummaryEvidenceItem[],
): readonly StoryPrimaryClaimFacet[] => [
  ...new Set(
    evidence.flatMap((item) => {
      const facet = storyPrimaryClaimFacet(item);
      return facet === undefined ? [] : [facet];
    }),
  ),
];

const claimFacetsAreCompatible = (
  left: readonly StoryPrimaryClaimFacet[],
  right: readonly StoryPrimaryClaimFacet[],
): boolean => {
  if (left.length === 0 && right.length === 0) {
    return true;
  }
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  const rightFacets = new Set(right);
  return left.some((facet) => rightFacets.has(facet));
};

const qualityCandidatePool = (
  candidates: readonly RenderedTopReadCandidate[],
  limit: number,
): readonly RenderedTopReadCandidate[] => {
  if (!isSocialNewsDominant(candidates, limit)) {
    return candidates;
  }

  const qualityCandidates = candidates.filter((candidate) =>
    isReaderFacingQualityTopRead(candidate.topRead),
  );
  const detailedQualityCandidates = qualityCandidates.filter(
    (candidate) =>
      candidate.topRead.reason.trim().length >= minimumDetailedReasonLength,
  );

  if (detailedQualityCandidates.length >= Math.min(limit, 8)) {
    return detailedQualityCandidates;
  }

  if (candidates.length <= limit) {
    return candidates;
  }

  return qualityCandidates.length >= Math.min(limit, 6)
    ? qualityCandidates
    : candidates;
};

const rankedCandidatePool = (
  candidates: readonly RenderedTopReadCandidate[],
): readonly RenderedTopReadCandidate[] =>
  candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftEditorial = left.candidate.editorialPriority;
      const rightEditorial = right.candidate.editorialPriority;
      if (
        leftEditorial !== undefined &&
        rightEditorial !== undefined &&
        leftEditorial.authoritativeLead !== rightEditorial.authoritativeLead
      ) {
        return compareReaderSummaryEditorialPriority(
          leftEditorial,
          rightEditorial,
        );
      }
      const scoreDelta =
        topReadRankScore(right.candidate.topRead) -
        topReadRankScore(left.candidate.topRead);
      if (Math.abs(scoreDelta) >= materialRankScoreOverride) {
        return scoreDelta;
      }
      if (leftEditorial !== undefined && rightEditorial !== undefined) {
        const editorialDifference = compareReaderSummaryEditorialPriority(
          leftEditorial,
          rightEditorial,
        );
        if (editorialDifference !== 0) {
          return editorialDifference;
        }
      }
      return scoreDelta === 0 ? left.index - right.index : scoreDelta;
    })
    .map((entry) => entry.candidate);

const topReadRankScore = (read: TopRead): number =>
  read.signalScore +
  confidenceRankBoost(read) +
  crossSourceRankBoost(read) +
  citationRankBoost(read);

const materialRankScoreOverride = 0.75;

const confidenceRankBoost = (read: TopRead): number => {
  if (read.confidence.level === "high") {
    return 0.35;
  }
  if (read.confidence.level === "medium") {
    return 0.18;
  }

  return 0;
};

const crossSourceRankBoost = (read: TopRead): number =>
  read.confirmedProviderKeys.length > 1 ? 0.3 : 0;

const citationRankBoost = (read: TopRead): number =>
  Math.min(read.citationIds.length, 3) * 0.03;

const isSocialNewsDominant = (
  candidates: readonly RenderedTopReadCandidate[],
  limit: number,
): boolean =>
  candidates.filter((candidate) =>
    socialNewsProviderKeys.has(candidate.topRead.providerKey),
  ).length >= Math.min(limit, candidates.length);

export const isReaderFacingQualityTopRead = (
  read: ReaderFacingTopReadQualityInput,
): boolean => {
  if (
    isUnpolishedReaderTitle(read.title) ||
    hasFallbackReason(read) ||
    isReaderTitleReasonDuplicate(read.title, read.reason)
  ) {
    return false;
  }
  if (!socialNewsProviderKeys.has(read.providerKey)) {
    return true;
  }
  if (
    read.confirmedProviderKeys.length > 1 ||
    read.confidence.level !== "low"
  ) {
    return true;
  }
  if (isTrustedOfficialXPost(read)) {
    return true;
  }
  if (read.signalScore >= strongSingleSourceSignalScore) {
    return !isUnverifiedBreakingXPost(read);
  }
  if (read.signalScore >= usefulSingleSourceSignalScore) {
    return !isUnverifiedBreakingXPost(read);
  }

  return false;
};

const isTrustedOfficialXPost = (
  read: ReaderFacingTopReadQualityInput,
): boolean => {
  if (read.providerKey !== "x-twitter") {
    return false;
  }
  const username = xUsername(read.canonicalUrl);

  return username !== undefined && trustedXUsernames.has(username);
};

const isUnverifiedBreakingXPost = (
  read: ReaderFacingTopReadQualityInput,
): boolean =>
  read.providerKey === "x-twitter" &&
  read.confirmedProviderKeys.length <= 1 &&
  /^(?:unverified report:)|\b(?:breaking|just\s+in)\b/iu.test(read.title);

const hasFallbackReason = (read: ReaderFacingTopReadQualityInput): boolean =>
  isFallbackReaderReason(read.reason);

const xUsername = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== "x.com" && hostname !== "twitter.com") {
      return undefined;
    }

    return parsed.pathname
      .split("/")
      .filter((segment) => segment.length > 0)[0]
      ?.toLowerCase();
  } catch {
    return undefined;
  }
};

const activeProviderKeys = (params: {
  readonly candidates: readonly RenderedTopReadCandidate[];
  readonly sourceMix: readonly SourceMixEntry[];
}): readonly string[] =>
  compactUnique([
    ...params.sourceMix
      .filter(
        (source) =>
          source.itemCount > 0 ||
          source.citationCount > 0 ||
          source.storyClusterCount > 0,
      )
      .map((source) => source.providerKey)
      .filter((providerKey) => socialNewsProviderKeys.has(providerKey)),
    ...params.candidates
      .map((candidate) => candidate.topRead.providerKey)
      .filter((providerKey) => socialNewsProviderKeys.has(providerKey)),
  ]);

const socialNewsProviderKeys = new Set([
  "x-twitter",
  "reddit",
  "hacker-news",
  "rss",
]);

const trustedXUsernames = new Set([
  "anthropicai",
  "cloudflare",
  "cursor_ai",
  "github",
  "googledeepmind",
  "mistralai",
  "openai",
]);
const strongSingleSourceSignalScore = 2.2;
const usefulSingleSourceSignalScore = 1.9;
const minimumDetailedReasonLength = 240;
const maxRenderedSocialProviderCount = 4;
const editorialDiversityWindow = 4;
const minimumSharedEditorialTokens = 3;
const minimumEditorialTopicSimilarity = 0.25;

const normalizeLimit = (value: number): number => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return 10;
  }

  return Math.min(value, 10);
};
