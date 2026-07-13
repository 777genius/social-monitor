import type { TopReadCandidate } from "../entities/top-read";
import {
  type EditoriallyCuratedTopReadCandidate,
  withReaderSummaryEditorialCuration,
} from "./reader-summary-editorial-curation-policy";

const detailedDescriptionMinimumLength = 280;
const minimumDistinctiveTitleTermMatches = 3;

export const enrichTopReadCandidateDescriptions = (params: {
  readonly candidates: readonly TopReadCandidate[];
  readonly modelStories: readonly TopReadCandidate[];
}): readonly EditoriallyCuratedTopReadCandidate[] => {
  return params.candidates.map((candidate) => {
    const editoriallyCurated = params.modelStories.some(
      (story) =>
        story.storyClusterId === candidate.storyClusterId &&
        candidate.citationIds.some((citationId) =>
          story.citationIds.includes(citationId),
        ),
    );
    const citedModelDescription = bestRelatedModelDescription(
      candidate,
      params.modelStories,
      exactCitationMatchScore,
    );
    if (citedModelDescription !== undefined) {
      return withReaderSummaryEditorialCuration(
        { ...candidate, summary: citedModelDescription },
        editoriallyCurated,
      );
    }

    if (candidate.summary.trim().length >= detailedDescriptionMinimumLength) {
      return withReaderSummaryEditorialCuration(candidate, editoriallyCurated);
    }

    const description = bestRelatedModelDescription(
      candidate,
      params.modelStories,
    );

    return withReaderSummaryEditorialCuration(
      description === undefined
        ? candidate
        : { ...candidate, summary: description },
      editoriallyCurated,
    );
  });
};

const bestRelatedModelDescription = (
  candidate: TopReadCandidate,
  modelStories: readonly TopReadCandidate[],
  minimumScore = 1,
): string | undefined =>
  modelStories
    .filter(
      (story) =>
        story.summary.trim().length >= detailedDescriptionMinimumLength,
    )
    .map((story) => ({
      story,
      score: relatedStoryScore(candidate, story),
      strictCitationSuperset: isStrictCitationSuperset(candidate, story),
    }))
    .filter((entry) => entry.score >= minimumScore)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.strictCitationSuperset) -
          Number(left.strictCitationSuperset) ||
        right.story.citationIds.length - left.story.citationIds.length,
    )[0]?.story.summary;

const isStrictCitationSuperset = (
  candidate: TopReadCandidate,
  modelStory: TopReadCandidate,
): boolean => {
  if (modelStory.citationIds.length <= candidate.citationIds.length) {
    return false;
  }
  const modelCitationIds = new Set(modelStory.citationIds);

  return candidate.citationIds.every((citationId) =>
    modelCitationIds.has(citationId),
  );
};

const relatedStoryScore = (
  candidate: TopReadCandidate,
  modelStory: TopReadCandidate,
): number => {
  const modelCitationIds = new Set(modelStory.citationIds);
  const citationOverlap = candidate.citationIds.filter((citationId) =>
    modelCitationIds.has(citationId),
  ).length;
  if (citationOverlap > 0) {
    return 1_000 + citationOverlap;
  }

  const candidateTokens = distinctiveTitleTokens(candidate.title);
  const modelText = normalizeText(`${modelStory.title} ${modelStory.summary}`);
  const sharedTokens = candidateTokens.filter((token) =>
    modelText.includes(token),
  );

  return sharedTokens.length >= minimumDistinctiveTitleTermMatches
    ? sharedTokens.length
    : 0;
};

const exactCitationMatchScore = 1_000;

const distinctiveTitleTokens = (value: string): readonly string[] =>
  [
    ...new Set(
      normalizeText(value).match(/[\p{L}\p{N}][\p{L}\p{N}-]{5,}/gu) ?? [],
    ),
  ].filter((token) => !genericTitleTokens.has(token));

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .trim();

const genericTitleTokens = new Set([
  "agents",
  "chatgpt",
  "codex",
  "hacker",
  "launch",
  "models",
  "openai",
  "reddit",
  "report",
  "rollout",
  "source",
  "update",
]);
