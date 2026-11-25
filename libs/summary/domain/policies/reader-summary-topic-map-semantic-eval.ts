import type { ReaderSummaryTopicMap } from "../entities/reader-summary-topic-map";
import type { ReaderSummaryTopicClaimType } from "../services/reader-summary-topic-claim-label-policy";
import { topicLabelExpressesClaimType } from "../services/reader-summary-topic-claim-label-policy";

export type ReaderSummaryTopicSemanticExpectation = {
  readonly feedItemId: string;
  readonly expectedStoryKey: string;
  readonly expectedTopicKey?: string;
  readonly expectedClaimType?: ReaderSummaryTopicClaimType;
  readonly acceptableClaimTypes?: readonly ReaderSummaryTopicClaimType[];
  readonly expectedSubjectTokens?: readonly string[];
  readonly forbiddenLabelTokens?: readonly string[];
  readonly requiredInTopicMap?: boolean;
};

export type ReaderSummaryTopicSemanticEvalInput = {
  readonly storyClusters: readonly {
    readonly id: string;
    readonly representativeFeedItemId: string;
    readonly duplicateFeedItemIds: readonly string[];
  }[];
  readonly topicMap: ReaderSummaryTopicMap;
  readonly expectations: readonly ReaderSummaryTopicSemanticExpectation[];
};

export type ReaderSummaryTopicSemanticEvalResult = {
  readonly passed: boolean;
  readonly metrics: {
    readonly expectationCount: number;
    readonly evaluatedExpectationCount: number;
    readonly skippedOptionalCount: number;
    readonly requiredTopicCount: number;
    readonly storyCoverage: number;
    readonly topicCoverage: number;
    readonly storyPairPrecision: number;
    readonly storyPairRecall: number;
    readonly topicPairPrecision: number;
    readonly topicPairRecall: number;
    readonly claimAccuracy: number;
    readonly subjectAccuracy: number;
    readonly labelQualityAccuracy: number;
  };
  readonly issues: readonly string[];
};

export const evaluateReaderSummaryTopicSemantics = (
  input: ReaderSummaryTopicSemanticEvalInput,
): ReaderSummaryTopicSemanticEvalResult => {
  const clusterByFeedItemId = new Map<string, string>();
  for (const cluster of input.storyClusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      clusterByFeedItemId.set(feedItemId, cluster.id);
    }
  }
  const nodeByClusterId = new Map(
    input.topicMap.nodes.flatMap((node) =>
      node.storyClusterIds.map((clusterId) => [clusterId, node] as const),
    ),
  );
  const requiredTopicExpectations = input.expectations.filter(
    (expectation) => expectation.requiredInTopicMap === true,
  );
  const predictedStoryKey = (
    expectation: ReaderSummaryTopicSemanticExpectation,
  ) => clusterByFeedItemId.get(expectation.feedItemId);
  const predictedTopicKey = (
    expectation: ReaderSummaryTopicSemanticExpectation,
  ) => {
    const clusterId = predictedStoryKey(expectation);

    return clusterId === undefined
      ? undefined
      : nodeByClusterId.get(clusterId)?.id;
  };
  const observedExpectations = input.expectations.filter(
    (expectation) => predictedStoryKey(expectation) !== undefined,
  );
  const observedTopicExpectations = input.expectations.filter(
    (expectation) => predictedTopicKey(expectation) !== undefined,
  );
  const storyPairs = pairMetrics(
    observedExpectations,
    (expectation) => expectation.expectedStoryKey,
    predictedStoryKey,
  );
  const topicPairs = pairMetrics(
    observedTopicExpectations.filter(
      (expectation) => expectation.expectedTopicKey !== undefined,
    ),
    (expectation) => expectation.expectedTopicKey,
    predictedTopicKey,
  );
  const missingStory = requiredTopicExpectations.filter(
    (expectation) => predictedStoryKey(expectation) === undefined,
  );
  const missingTopic = requiredTopicExpectations.filter(
    (expectation) => predictedTopicKey(expectation) === undefined,
  );
  const claimExpectations = input.expectations.filter(
    (expectation) => expectedClaimTypes(expectation).length > 0,
  );
  const evaluatedClaimExpectations = claimExpectations.filter(
    (expectation) =>
      expectation.requiredInTopicMap === true ||
      predictedTopicKey(expectation) !== undefined,
  );
  const claimMismatches = evaluatedClaimExpectations.filter((expectation) => {
    const expectedTypes = expectedClaimTypes(expectation);
    const clusterId = predictedStoryKey(expectation);
    const label =
      clusterId === undefined
        ? undefined
        : nodeByClusterId.get(clusterId)?.label;

    return (
      label !== undefined &&
      !expectedTypes.some((claimType) =>
        topicLabelExpressesClaimType(label, claimType),
      )
    );
  });
  const subjectExpectations = input.expectations.filter(
    (expectation) => (expectation.expectedSubjectTokens?.length ?? 0) > 0,
  );
  const evaluatedSubjectExpectations = subjectExpectations.filter(
    (expectation) =>
      expectation.requiredInTopicMap === true ||
      predictedTopicKey(expectation) !== undefined,
  );
  const subjectMismatches = evaluatedSubjectExpectations.filter(
    (expectation) => {
      const clusterId = predictedStoryKey(expectation);
      const label =
        clusterId === undefined
          ? undefined
          : nodeByClusterId.get(clusterId)?.label;
      if (label === undefined) {
        return false;
      }
      const expectedTokens = expectation.expectedSubjectTokens ?? [];
      const labelTokens = normalizedTokens(label);

      return expectedTokens.some(
        (token) => !labelTokens.has(normalizeToken(token)),
      );
    },
  );
  const labelQualityExpectations = input.expectations.filter(
    (expectation) => (expectation.forbiddenLabelTokens?.length ?? 0) > 0,
  );
  const evaluatedLabelQualityExpectations = labelQualityExpectations.filter(
    (expectation) =>
      expectation.requiredInTopicMap === true ||
      predictedTopicKey(expectation) !== undefined,
  );
  const labelQualityMismatches = evaluatedLabelQualityExpectations.filter(
    (expectation) => {
      const clusterId = predictedStoryKey(expectation);
      const label =
        clusterId === undefined
          ? undefined
          : nodeByClusterId.get(clusterId)?.label;
      if (label === undefined) {
        return false;
      }
      const labelTokens = normalizedTokens(label);

      return (expectation.forbiddenLabelTokens ?? []).some((token) =>
        labelTokens.has(normalizeToken(token)),
      );
    },
  );
  const issues = [
    ...missingStory.map(
      (item) => `Missing story cluster for feed item ${item.feedItemId}`,
    ),
    ...missingTopic.map(
      (item) => `Missing required topic node for feed item ${item.feedItemId}`,
    ),
    ...(storyPairs.falseMergeCount > 0
      ? [`Story false merges: ${storyPairs.falseMergeCount}`]
      : []),
    ...(storyPairs.falseSplitCount > 0
      ? [`Story false splits: ${storyPairs.falseSplitCount}`]
      : []),
    ...(topicPairs.falseMergeCount > 0
      ? [`Topic false merges: ${topicPairs.falseMergeCount}`]
      : []),
    ...(topicPairs.falseSplitCount > 0
      ? [`Topic false splits: ${topicPairs.falseSplitCount}`]
      : []),
    ...claimMismatches.map(
      (item) => `Claim label mismatch for feed item ${item.feedItemId}`,
    ),
    ...subjectMismatches.map(
      (item) => `Subject label mismatch for feed item ${item.feedItemId}`,
    ),
    ...labelQualityMismatches.map(
      (item) => `Forbidden label token for feed item ${item.feedItemId}`,
    ),
  ];

  return {
    passed: issues.length === 0,
    metrics: {
      expectationCount: input.expectations.length,
      evaluatedExpectationCount: observedExpectations.length,
      skippedOptionalCount: input.expectations.filter(
        (expectation) =>
          expectation.requiredInTopicMap !== true &&
          predictedStoryKey(expectation) === undefined,
      ).length,
      requiredTopicCount: requiredTopicExpectations.length,
      storyCoverage: ratio(
        requiredTopicExpectations.length - missingStory.length,
        requiredTopicExpectations.length,
      ),
      topicCoverage: ratio(
        requiredTopicExpectations.length - missingTopic.length,
        requiredTopicExpectations.length,
      ),
      storyPairPrecision: storyPairs.precision,
      storyPairRecall: storyPairs.recall,
      topicPairPrecision: topicPairs.precision,
      topicPairRecall: topicPairs.recall,
      claimAccuracy: ratio(
        evaluatedClaimExpectations.length -
          countRequiredMissingTopic(
            evaluatedClaimExpectations,
            predictedTopicKey,
          ) -
          claimMismatches.length,
        evaluatedClaimExpectations.length,
      ),
      subjectAccuracy: ratio(
        evaluatedSubjectExpectations.length -
          countRequiredMissingTopic(
            evaluatedSubjectExpectations,
            predictedTopicKey,
          ) -
          subjectMismatches.length,
        evaluatedSubjectExpectations.length,
      ),
      labelQualityAccuracy: ratio(
        evaluatedLabelQualityExpectations.length -
          countRequiredMissingTopic(
            evaluatedLabelQualityExpectations,
            predictedTopicKey,
          ) -
          labelQualityMismatches.length,
        evaluatedLabelQualityExpectations.length,
      ),
    },
    issues,
  };
};

const expectedClaimTypes = (
  expectation: ReaderSummaryTopicSemanticExpectation,
): readonly ReaderSummaryTopicClaimType[] =>
  expectation.acceptableClaimTypes ??
  (expectation.expectedClaimType === undefined
    ? []
    : [expectation.expectedClaimType]);

const countRequiredMissingTopic = (
  expectations: readonly ReaderSummaryTopicSemanticExpectation[],
  predictedTopicKey: (
    expectation: ReaderSummaryTopicSemanticExpectation,
  ) => string | undefined,
): number =>
  expectations.filter(
    (expectation) =>
      expectation.requiredInTopicMap === true &&
      predictedTopicKey(expectation) === undefined,
  ).length;

const pairMetrics = <T>(
  values: readonly T[],
  expectedKey: (value: T) => string | undefined,
  predictedKey: (value: T) => string | undefined,
) => {
  let truePositiveCount = 0;
  let falseMergeCount = 0;
  let falseSplitCount = 0;
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const expectedSame =
        expectedKey(values[left]!) !== undefined &&
        expectedKey(values[left]!) === expectedKey(values[right]!);
      const predictedSame =
        predictedKey(values[left]!) !== undefined &&
        predictedKey(values[left]!) === predictedKey(values[right]!);
      if (expectedSame && predictedSame) {
        truePositiveCount += 1;
      } else if (!expectedSame && predictedSame) {
        falseMergeCount += 1;
      } else if (expectedSame) {
        falseSplitCount += 1;
      }
    }
  }

  return {
    falseMergeCount,
    falseSplitCount,
    precision: ratio(truePositiveCount, truePositiveCount + falseMergeCount),
    recall: ratio(truePositiveCount, truePositiveCount + falseSplitCount),
  };
};

const normalizedTokens = (value: string): ReadonlySet<string> =>
  new Set(
    value
      .split(/[^\p{L}\p{N}.+-]+/u)
      .map(normalizeToken)
      .filter(Boolean),
  );

const normalizeToken = (value: string): string =>
  value.toLocaleLowerCase("en-US").trim();

const ratio = (value: number, total: number): number =>
  total === 0 ? 1 : Math.round((value / total) * 1000) / 1000;
