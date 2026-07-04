import type { JsonObject } from '@social-monitor/shared-kernel';

import type { SourceQueryPlannerIntent } from './source-query-plan';
import type { SourceItemRankingMode } from './source-item-ranking-policy';

export type RankingEvalLane = {
  readonly laneId: string;
  readonly sourceKey: string;
  readonly operation: string;
  readonly query: string;
  readonly maxItems: number;
};

export type RankingEvalCandidate = {
  readonly candidateId: string;
  readonly providerKey: string;
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly metadata?: JsonObject;
  readonly snapshotRank?: number;
};

export type CandidateLabel = {
  readonly candidateId: string;
  readonly relevance: number;
  readonly usefulness: number;
  readonly authority: number;
  readonly novelty: number;
  readonly confidence: number;
  readonly mustHave?: boolean;
  readonly duplicateOf?: string;
  readonly officialSignal?: boolean;
  readonly communitySignal?: boolean;
  readonly viralOffTopic?: boolean;
  readonly spam?: boolean;
  readonly notes?: string;
};

export type RankingEvalCase = {
  readonly caseId: string;
  readonly topic: string;
  readonly sourceKeys: readonly string[];
  readonly queryLanes: readonly RankingEvalLane[];
  readonly queryPlannerIntent?: SourceQueryPlannerIntent;
  readonly rankingMode?: SourceItemRankingMode;
  readonly rankingQueries?: readonly string[];
  readonly candidates: readonly RankingEvalCandidate[];
  readonly labels: readonly CandidateLabel[];
};

export type RankingEvalQualityGates = {
  readonly minPrecisionAt10: number;
  readonly minNdcgAt20: number;
  readonly minMustHaveRecallAt20: number;
  readonly maxDuplicateRateAt20: number;
  readonly minSourceDiversityAt20: number;
  readonly minOfficialCommunityCoverageAt20: number;
  readonly maxViralOffTopicAt10: number;
  readonly maxLowConfidenceLabelRate: number;
};

export type RankingMetric = {
  readonly metricId: string;
  readonly value: number;
  readonly threshold: number;
  readonly passed: boolean;
};

export type RankingEvalCaseResult = {
  readonly caseId: string;
  readonly rankedCandidateIds: readonly string[];
  readonly rankingMetadata?: JsonObject;
  readonly metrics: {
    readonly precisionAt10: number;
    readonly ndcgAt20: number;
    readonly mustHaveRecallAt20: number;
    readonly duplicateRateAt20: number;
    readonly sourceDiversityAt20: number;
    readonly officialCommunityCoverageAt20: number;
    readonly viralOffTopicAt10: number;
    readonly lowConfidenceLabelRate: number;
  };
  readonly missingMustHaveCandidateIds: readonly string[];
};

export type RankingEvalSuiteResult = {
  readonly datasetVersion: string;
  readonly caseResults: readonly RankingEvalCaseResult[];
  readonly metrics: readonly RankingMetric[];
  readonly blockingPassed: boolean;
};

export const DEFAULT_RANKING_EVAL_QUALITY_GATES: RankingEvalQualityGates = {
  minPrecisionAt10: 0.7,
  minNdcgAt20: 0.78,
  minMustHaveRecallAt20: 1,
  maxDuplicateRateAt20: 0.25,
  minSourceDiversityAt20: 0.2,
  minOfficialCommunityCoverageAt20: 0.8,
  maxViralOffTopicAt10: 0,
  maxLowConfidenceLabelRate: 0.35,
};

export const evaluateRankingEvalCase = (params: {
  readonly evalCase: RankingEvalCase;
  readonly rankedCandidateIds: readonly string[];
  readonly rankingMetadata?: JsonObject;
}): RankingEvalCaseResult => {
  const labelsByCandidateId = new Map(
    params.evalCase.labels.map((label) => [label.candidateId, label]),
  );
  const candidatesByCandidateId = new Map(
    params.evalCase.candidates.map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  const rankedCandidateIds = compactUnique(params.rankedCandidateIds);
  const top10 = rankedCandidateIds.slice(0, 10);
  const top20 = rankedCandidateIds.slice(0, 20);
  const mustHaveCandidateIds = params.evalCase.labels
    .filter((label) => label.mustHave === true)
    .map((label) => label.candidateId);
  const top20Set = new Set(top20);
  const missingMustHaveCandidateIds = mustHaveCandidateIds.filter(
    (candidateId) => !top20Set.has(candidateId),
  );

  return {
    caseId: params.evalCase.caseId,
    rankedCandidateIds,
    rankingMetadata: params.rankingMetadata,
    metrics: {
      precisionAt10: roundMetric(precisionAt(top10, labelsByCandidateId)),
      ndcgAt20: roundMetric(ndcgAt(top20, params.evalCase.labels)),
      mustHaveRecallAt20: roundMetric(
        recallAt(mustHaveCandidateIds, top20Set),
      ),
      duplicateRateAt20: roundMetric(
        duplicateRateAt(top20, labelsByCandidateId),
      ),
      sourceDiversityAt20: roundMetric(
        sourceDiversityAt(
          top20,
          candidatesByCandidateId,
          params.evalCase.sourceKeys,
        ),
      ),
      officialCommunityCoverageAt20: roundMetric(
        officialCommunityCoverageAt(top20Set, params.evalCase.labels),
      ),
      viralOffTopicAt10: viralOffTopicAt(top10, labelsByCandidateId),
      lowConfidenceLabelRate: roundMetric(
        lowConfidenceLabelRate(params.evalCase.labels),
      ),
    },
    missingMustHaveCandidateIds,
  };
};

export const evaluateRankingEvalSuite = (params: {
  readonly datasetVersion: string;
  readonly caseResults: readonly RankingEvalCaseResult[];
  readonly qualityGates?: RankingEvalQualityGates;
}): RankingEvalSuiteResult => {
  const gates = params.qualityGates ?? DEFAULT_RANKING_EVAL_QUALITY_GATES;
  const metrics = [
    minimumMetric(
      'precisionAt10',
      averageMetric(params.caseResults, (result) => result.metrics.precisionAt10),
      gates.minPrecisionAt10,
    ),
    minimumMetric(
      'ndcgAt20',
      averageMetric(params.caseResults, (result) => result.metrics.ndcgAt20),
      gates.minNdcgAt20,
    ),
    minimumMetric(
      'mustHaveRecallAt20',
      averageMetric(
        params.caseResults,
        (result) => result.metrics.mustHaveRecallAt20,
      ),
      gates.minMustHaveRecallAt20,
    ),
    maximumMetric(
      'duplicateRateAt20',
      averageMetric(
        params.caseResults,
        (result) => result.metrics.duplicateRateAt20,
      ),
      gates.maxDuplicateRateAt20,
    ),
    minimumMetric(
      'sourceDiversityAt20',
      averageMetric(
        params.caseResults,
        (result) => result.metrics.sourceDiversityAt20,
      ),
      gates.minSourceDiversityAt20,
    ),
    minimumMetric(
      'officialCommunityCoverageAt20',
      averageMetric(
        params.caseResults,
        (result) => result.metrics.officialCommunityCoverageAt20,
      ),
      gates.minOfficialCommunityCoverageAt20,
    ),
    maximumMetric(
      'viralOffTopicAt10',
      params.caseResults.reduce(
        (total, result) => total + result.metrics.viralOffTopicAt10,
        0,
      ),
      gates.maxViralOffTopicAt10,
    ),
    maximumMetric(
      'lowConfidenceLabelRate',
      averageMetric(
        params.caseResults,
        (result) => result.metrics.lowConfidenceLabelRate,
      ),
      gates.maxLowConfidenceLabelRate,
    ),
  ];

  return {
    datasetVersion: params.datasetVersion,
    caseResults: params.caseResults,
    metrics,
    blockingPassed: metrics.every((metric) => metric.passed),
  };
};

const precisionAt = (
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

const ndcgAt = (
  rankedCandidateIds: readonly string[],
  labels: readonly CandidateLabel[],
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
    .slice(0, rankedCandidateIds.length)
    .map(discountedGain);
  const ideal = sum(idealGains);

  return ideal === 0 ? 1 : sum(gains) / ideal;
};

const recallAt = (
  expectedCandidateIds: readonly string[],
  selectedCandidateIds: ReadonlySet<string>,
): number =>
  expectedCandidateIds.length === 0
    ? 1
    : expectedCandidateIds.filter((candidateId) =>
        selectedCandidateIds.has(candidateId),
      ).length / expectedCandidateIds.length;

const duplicateRateAt = (
  candidateIds: readonly string[],
  labelsByCandidateId: ReadonlyMap<string, CandidateLabel>,
): number =>
  candidateIds.length === 0
    ? 0
    : candidateIds.filter(
        (candidateId) =>
          labelsByCandidateId.get(candidateId)?.duplicateOf !== undefined,
      ).length / candidateIds.length;

const sourceDiversityAt = (
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

const officialCommunityCoverageAt = (
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

const viralOffTopicAt = (
  candidateIds: readonly string[],
  labelsByCandidateId: ReadonlyMap<string, CandidateLabel>,
): number =>
  candidateIds.filter(
    (candidateId) => labelsByCandidateId.get(candidateId)?.viralOffTopic === true,
  ).length;

const lowConfidenceLabelRate = (labels: readonly CandidateLabel[]): number =>
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

const minimumMetric = (
  metricId: string,
  value: number,
  threshold: number,
): RankingMetric => ({
  metricId,
  value: roundMetric(value),
  threshold,
  passed: value >= threshold,
});

const maximumMetric = (
  metricId: string,
  value: number,
  threshold: number,
): RankingMetric => ({
  metricId,
  value: roundMetric(value),
  threshold,
  passed: value <= threshold,
});

const averageMetric = (
  caseResults: readonly RankingEvalCaseResult[],
  selector: (result: RankingEvalCaseResult) => number,
): number =>
  caseResults.length === 0
    ? 0
    : sum(caseResults.map(selector)) / caseResults.length;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const roundMetric = (value: number): number => Math.round(value * 1_000) / 1_000;

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
