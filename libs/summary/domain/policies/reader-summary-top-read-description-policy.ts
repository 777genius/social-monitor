import type { TopReadCandidate } from "../entities/top-read";

const detailedDescriptionMinimumLength = 280;
const minimumDistinctiveTitleTermMatches = 3;

export const enrichTopReadCandidateDescriptions = (params: {
  readonly candidates: readonly TopReadCandidate[];
  readonly modelStories: readonly TopReadCandidate[];
}): readonly TopReadCandidate[] =>
  params.candidates.map((candidate) => {
    if (candidate.summary.trim().length >= detailedDescriptionMinimumLength) {
      return candidate;
    }

    const description = bestRelatedModelDescription(
      candidate,
      params.modelStories,
    );

    return description === undefined
      ? candidate
      : { ...candidate, summary: description };
  });

const bestRelatedModelDescription = (
  candidate: TopReadCandidate,
  modelStories: readonly TopReadCandidate[],
): string | undefined =>
  modelStories
    .filter(
      (story) =>
        story.summary.trim().length >= detailedDescriptionMinimumLength,
    )
    .map((story) => ({
      story,
      score: relatedStoryScore(candidate, story),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.story.summary;

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
