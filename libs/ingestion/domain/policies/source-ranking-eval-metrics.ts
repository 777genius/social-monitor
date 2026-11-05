import type { CandidateLabel, RankingEvalCandidate } from './source-ranking-eval-policy';

/** Pure ranking quality metrics independent of suite orchestration and gating. */
export const precisionAt = (
  candidateIds: readonly string[],
  labelsByCandidateId: ReadonlyMap<string, CandidateLabel>,
): number => {
  if (candidateIds.length === 0) {
    return 0;
  }

  const relevantCount = candidateIds.filter((candidateId) =>
    isRelevant(labelsByCandidateId.get(candidateId)),
  ).length;

  return relevantCount / candidateIds.length;
};

export const ndcgAt = (
  rankedCandidateIds: readonly string[],
  labels: readonly CandidateLabel[],
  cutoff: number,
): number => {
  const labelsByCandidateId = new Map(
    labels.map((label) => [label.candidateId, label]),
  );
  const gains = rankedCandidateIds.map((candidateId, index) =>
    discountedGain(labelGain(labelsByCandidateId.get(candidateId)), index),
  );
  const idealGains = labels
    .map(labelGain)
    .sort((left, right) => right - left)
    .slice(0, cutoff)
    .map(discountedGain);
  const ideal = sum(idealGains);

  return ideal === 0 ? 1 : sum(gains) / ideal;
};

export const recallAt = (
  expectedCandidateIds: readonly string[],
  selectedCandidateIds: ReadonlySet<string>,
): number =>
  expectedCandidateIds.length === 0
    ? 1
    : expectedCandidateIds.filter((candidateId) =>
        selectedCandidateIds.has(candidateId),
      ).length / expectedCandidateIds.length;

export const duplicateRateAt = (
  candidateIds: readonly string[],
  labelsByCandidateId: ReadonlyMap<string, CandidateLabel>,
): number =>
  candidateIds.length === 0
    ? 0
    : candidateIds.filter(
        (candidateId) =>
          labelsByCandidateId.get(candidateId)?.duplicateOf !== undefined,
      ).length / candidateIds.length;

export const sourceDiversityAt = (
  candidateIds: readonly string[],
  candidatesByCandidateId: ReadonlyMap<string, RankingEvalCandidate>,
  expectedSourceKeys: readonly string[],
): number => {
  const expectedProviders = new Set(expectedSourceKeys);

  if (expectedProviders.size <= 1) {
    return 1;
  }

  const selectedProviders = new Set(
    candidateIds.flatMap((candidateId) => {
      const providerKey = candidatesByCandidateId.get(candidateId)?.providerKey;

      return providerKey === undefined || !expectedProviders.has(providerKey)
        ? []
        : [providerKey];
    }),
  );

  return selectedProviders.size / expectedProviders.size;
};

export const officialCommunityCoverageAt = (
  selectedCandidateIds: ReadonlySet<string>,
  labels: readonly CandidateLabel[],
): number => {
  const expectedDimensions = [
    labels.some((label) => label.officialSignal === true),
    labels.some((label) => label.communitySignal === true),
  ].filter(Boolean).length;

  if (expectedDimensions === 0) {
    return 1;
  }

  const selectedLabels = labels.filter((label) =>
    selectedCandidateIds.has(label.candidateId),
  );
  const coveredDimensions = [
    selectedLabels.some((label) => label.officialSignal === true),
    selectedLabels.some((label) => label.communitySignal === true),
  ].filter(Boolean).length;

  return coveredDimensions / expectedDimensions;
};

export const viralOffTopicAt = (
  candidateIds: readonly string[],
  labelsByCandidateId: ReadonlyMap<string, CandidateLabel>,
): number =>
  candidateIds.filter(
    (candidateId) => labelsByCandidateId.get(candidateId)?.viralOffTopic === true,
  ).length;

export const lowConfidenceLabelRate = (labels: readonly CandidateLabel[]): number =>
  labels.length === 0
    ? 0
    : labels.filter((label) => label.confidence < 0.7).length / labels.length;

const isRelevant = (label: CandidateLabel | undefined): boolean =>
  label !== undefined && label.spam !== true && label.relevance >= 2;

const labelGain = (label: CandidateLabel | undefined): number => {
  if (label === undefined || label.spam === true) {
    return 0;
  }

  return Math.max(
    0,
    label.relevance +
      label.usefulness * 0.5 +
      label.authority * 0.25 +
      label.novelty * 0.25 +
      (label.mustHave === true ? 1 : 0),
  );
};

const discountedGain = (gain: number, index: number): number =>
  gain / Math.log2(index + 2);

export const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

export const roundMetric = (value: number): number => Math.round(value * 1_000) / 1_000;

