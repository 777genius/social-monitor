import type {
  RankingEvalCase,
  RankingEvalCandidate,
  CandidateLabel,
  RankingMetric,
} from './source-ranking-eval-policy';
import type {
  SourceQueryPlan,
  SourceQueryPlanLane,
  SourceQueryPlannerIntent,
} from './source-query-plan';

export type SourceQueryPlanVariantResult = {
  readonly plannerId: string;
  readonly laneCount: number;
  readonly retrievedCandidateIds: readonly string[];
  readonly mustHaveRecallAt20: number;
  readonly relevantRecallAt20: number;
  readonly officialCommunityCoverageAt20: number;
};

export type SourceQueryPlannerEvalCaseResult = {
  readonly caseId: string;
  readonly baseline: SourceQueryPlanVariantResult;
  readonly experiment: SourceQueryPlanVariantResult;
  readonly deltas: {
    readonly mustHaveRecallAt20: number;
    readonly relevantRecallAt20: number;
    readonly officialCommunityCoverageAt20: number;
  };
  readonly decision: 'improved' | 'same' | 'regressed';
};

export type SourceQueryPlannerEvalQualityGates = {
  readonly minExperimentMustHaveRecallAt20: number;
  readonly minExperimentRelevantRecallAt20: number;
  readonly minExperimentOfficialCommunityCoverageAt20: number;
  readonly minImprovedCaseCount: number;
  readonly maxRegressedCaseCount: number;
};

export type SourceQueryPlannerEvalSuiteResult = {
  readonly datasetVersion: string;
  readonly caseResults: readonly SourceQueryPlannerEvalCaseResult[];
  readonly metrics: readonly RankingMetric[];
  readonly blockingPassed: boolean;
};

export const DEFAULT_SOURCE_QUERY_PLANNER_EVAL_QUALITY_GATES: SourceQueryPlannerEvalQualityGates =
  {
    minExperimentMustHaveRecallAt20: 1,
    minExperimentRelevantRecallAt20: 0.8,
    minExperimentOfficialCommunityCoverageAt20: 0.8,
    minImprovedCaseCount: 1,
    maxRegressedCaseCount: 0,
  };

export const defaultSourceQueryPlannerIntent = (
  evalCase: RankingEvalCase,
): SourceQueryPlannerIntent => ({
  topic: evalCase.topic,
  sourceKeys: evalCase.sourceKeys,
  maxLanesPerSource: 6,
  maxItemsPerLane: 40,
  includeEnrichment: true,
});

export const buildBaselineSourceQueryPlan = (
  intent: SourceQueryPlannerIntent,
): SourceQueryPlan => ({
  plannerId: 'baseline:single-topic-lane',
  intent,
  lanes: intent.sourceKeys.map((sourceKey) => ({
    laneId: `${sourceKey}:general:${stableSlug(intent.topic)}`,
    sourceKey,
    kind: 'general',
    operation: 'search',
    query: intent.topic,
    priority: 100,
    maxItems: intent.maxItemsPerLane ?? 25,
    reason: 'baseline single semantic query lane',
  })),
  warnings: [],
});

export const evaluateSourceQueryPlannerCase = (params: {
  readonly evalCase: RankingEvalCase;
  readonly baselinePlan: SourceQueryPlan;
  readonly experimentPlan: SourceQueryPlan;
}): SourceQueryPlannerEvalCaseResult => {
  const baseline = evaluatePlanVariant({
    plannerId: params.baselinePlan.plannerId,
    evalCase: params.evalCase,
    plan: params.baselinePlan,
  });
  const experiment = evaluatePlanVariant({
    plannerId: params.experimentPlan.plannerId,
    evalCase: params.evalCase,
    plan: params.experimentPlan,
  });
  const deltas = {
    mustHaveRecallAt20: roundMetric(
      experiment.mustHaveRecallAt20 - baseline.mustHaveRecallAt20,
    ),
    relevantRecallAt20: roundMetric(
      experiment.relevantRecallAt20 - baseline.relevantRecallAt20,
    ),
    officialCommunityCoverageAt20: roundMetric(
      experiment.officialCommunityCoverageAt20 -
        baseline.officialCommunityCoverageAt20,
    ),
  };

  return {
    caseId: params.evalCase.caseId,
    baseline,
    experiment,
    deltas,
    decision: queryPlanDecision(deltas),
  };
};

export const evaluateSourceQueryPlannerSuite = (params: {
  readonly datasetVersion: string;
  readonly caseResults: readonly SourceQueryPlannerEvalCaseResult[];
  readonly qualityGates?: SourceQueryPlannerEvalQualityGates;
}): SourceQueryPlannerEvalSuiteResult => {
  const gates =
    params.qualityGates ?? DEFAULT_SOURCE_QUERY_PLANNER_EVAL_QUALITY_GATES;
  const improvedCaseCount = params.caseResults.filter(
    (result) => result.decision === 'improved',
  ).length;
  const regressedCaseCount = params.caseResults.filter(
    (result) => result.decision === 'regressed',
  ).length;
  const metrics = [
    minimumMetric(
      'experimentMustHaveRecallAt20',
      averageMetric(
        params.caseResults,
        (result) => result.experiment.mustHaveRecallAt20,
      ),
      gates.minExperimentMustHaveRecallAt20,
    ),
    minimumMetric(
      'experimentRelevantRecallAt20',
      averageMetric(
        params.caseResults,
        (result) => result.experiment.relevantRecallAt20,
      ),
      gates.minExperimentRelevantRecallAt20,
    ),
    minimumMetric(
      'experimentOfficialCommunityCoverageAt20',
      averageMetric(
        params.caseResults,
        (result) => result.experiment.officialCommunityCoverageAt20,
      ),
      gates.minExperimentOfficialCommunityCoverageAt20,
    ),
    minimumMetric(
      'improvedCaseCount',
      improvedCaseCount,
      gates.minImprovedCaseCount,
    ),
    maximumMetric(
      'regressedCaseCount',
      regressedCaseCount,
      gates.maxRegressedCaseCount,
    ),
  ];

  return {
    datasetVersion: params.datasetVersion,
    caseResults: params.caseResults,
    metrics,
    blockingPassed: metrics.every((metric) => metric.passed),
  };
};

const evaluatePlanVariant = (params: {
  readonly plannerId: string;
  readonly evalCase: RankingEvalCase;
  readonly plan: SourceQueryPlan;
}): SourceQueryPlanVariantResult => {
  const retrievedCandidateIds = params.evalCase.candidates
    .filter((candidate) => planRetrievesCandidate(params.plan, candidate))
    .map((candidate) => candidate.candidateId);
  const selectedSet = new Set(retrievedCandidateIds.slice(0, 20));

  return {
    plannerId: params.plannerId,
    laneCount: params.plan.lanes.length,
    retrievedCandidateIds,
    mustHaveRecallAt20: roundMetric(
      recallAt(
        params.evalCase.labels
          .filter((label) => label.mustHave === true)
          .map((label) => label.candidateId),
        selectedSet,
      ),
    ),
    relevantRecallAt20: roundMetric(
      recallAt(
        params.evalCase.labels.filter(isRelevant).map((label) => label.candidateId),
        selectedSet,
      ),
    ),
    officialCommunityCoverageAt20: roundMetric(
      officialCommunityCoverageAt(selectedSet, params.evalCase.labels),
    ),
  };
};

const planRetrievesCandidate = (
  plan: SourceQueryPlan,
  candidate: RankingEvalCandidate,
): boolean =>
  plan.lanes.some(
    (lane) =>
      lane.sourceKey === candidate.providerKey &&
      laneRetrievesCandidate(lane, candidate),
  );

const laneRetrievesCandidate = (
  lane: SourceQueryPlanLane,
  candidate: RankingEvalCandidate,
): boolean => {
  if (lane.operation === 'account_feed') {
    return handleFromQuery(lane.query) === normalizeHandle(candidate.authorHandle);
  }

  if (lane.operation === 'mention_search') {
    const handle = handleFromQuery(lane.query);

    return handle !== undefined && candidateText(candidate).includes(handle);
  }

  if (lane.operation === 'listing') {
    return candidateSubreddit(candidate) === subredditFromListingQuery(lane.query);
  }

  if (lane.operation === 'enrichment') {
    return false;
  }

  return searchLaneMatchesCandidate(lane.query, candidate);
};

const searchLaneMatchesCandidate = (
  query: string,
  candidate: RankingEvalCandidate,
): boolean => {
  const text = candidateText(candidate);
  const phrases = quotedPhrases(query);

  if (phrases.some((phrase) => text.includes(normalizeText(phrase)))) {
    return true;
  }

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return false;
  }

  const matched = tokens.filter((token) => text.includes(token)).length;

  return matched >= Math.min(2, tokens.length) && matched / tokens.length >= 0.5;
};

const queryPlanDecision = (
  deltas: SourceQueryPlannerEvalCaseResult['deltas'],
): SourceQueryPlannerEvalCaseResult['decision'] => {
  if (
    deltas.mustHaveRecallAt20 < 0 ||
    deltas.relevantRecallAt20 < 0 ||
    deltas.officialCommunityCoverageAt20 < 0
  ) {
    return 'regressed';
  }

  if (
    deltas.mustHaveRecallAt20 > 0 ||
    deltas.relevantRecallAt20 > 0 ||
    deltas.officialCommunityCoverageAt20 > 0
  ) {
    return 'improved';
  }

  return 'same';
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

const officialCommunityCoverageAt = (
  selectedCandidateIds: ReadonlySet<string>,
  labels: readonly CandidateLabel[],
): number => {
  const expected = [
    labels.some((label) => label.officialSignal === true),
    labels.some((label) => label.communitySignal === true),
  ].filter(Boolean).length;

  if (expected === 0) {
    return 1;
  }

  const selected = labels.filter((label) => selectedCandidateIds.has(label.candidateId));
  const covered = [
    selected.some((label) => label.officialSignal === true),
    selected.some((label) => label.communitySignal === true),
  ].filter(Boolean).length;

  return covered / expected;
};

const isRelevant = (label: CandidateLabel): boolean =>
  label.spam !== true && label.relevance >= 2;

const candidateText = (candidate: RankingEvalCandidate): string =>
  normalizeText(
    [
      candidate.title,
      candidate.body,
      candidate.authorHandle,
      candidate.canonicalUrl,
    ]
      .filter((value): value is string => value !== undefined)
      .join(' '),
  );

const candidateSubreddit = (
  candidate: RankingEvalCandidate,
): string | undefined => {
  const match = /\/r\/([^/]+)/iu.exec(candidate.canonicalUrl);

  return match?.[1]?.toLowerCase();
};

const subredditFromListingQuery = (query: string): string | undefined => {
  const [subreddit] = query.split(':');

  return subreddit === undefined || subreddit.trim().length === 0
    ? undefined
    : subreddit.trim().replace(/^r\//iu, '').toLowerCase();
};

const handleFromQuery = (query: string): string | undefined => {
  const match = /(?:from:|@)([a-z0-9_]{1,15})/iu.exec(query);

  return normalizeHandle(match?.[1]);
};

const normalizeHandle = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : value.replace(/^@/u, '').toLowerCase();

const tokenizeQuery = (query: string): readonly string[] =>
  compactUnique(
    (query.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/gu) ?? []).filter(
      (token) => !lowSignalQueryTokens.has(token),
    ),
  );

const quotedPhrases = (value: string): readonly string[] =>
  [...value.matchAll(/"([^"]+)"/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/\s+/gu, ' ').trim();

const stableSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48) || 'lane';

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
  caseResults: readonly SourceQueryPlannerEvalCaseResult[],
  selector: (result: SourceQueryPlannerEvalCaseResult) => number,
): number =>
  caseResults.length === 0
    ? 0
    : caseResults.reduce((total, result) => total + selector(result), 0) /
      caseResults.length;

const roundMetric = (value: number): number => Math.round(value * 1_000) / 1_000;

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const lowSignalQueryTokens = new Set([
  'ai',
  'and',
  'or',
  'not',
  'the',
  'with',
  'from',
  'since',
  'until',
  'filter',
  'lang',
]);
