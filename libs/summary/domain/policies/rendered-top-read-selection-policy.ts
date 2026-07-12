import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
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

  return rankedCandidatePool(selected);
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
      if (
        left.candidate.editorialPriority !== undefined &&
        right.candidate.editorialPriority !== undefined
      ) {
        const editorialDifference = compareReaderSummaryEditorialPriority(
          left.candidate.editorialPriority,
          right.candidate.editorialPriority,
        );
        if (editorialDifference !== 0) {
          return editorialDifference;
        }
      }
      const scoreDelta =
        topReadRankScore(right.candidate.topRead) -
        topReadRankScore(left.candidate.topRead);

      return scoreDelta === 0 ? left.index - right.index : scoreDelta;
    })
    .map((entry) => entry.candidate);

const topReadRankScore = (read: TopRead): number =>
  read.signalScore +
  confidenceRankBoost(read) +
  crossSourceRankBoost(read) +
  citationRankBoost(read);

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

const normalizeLimit = (value: number): number => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return 10;
  }

  return Math.min(value, 10);
};
