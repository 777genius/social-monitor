export type StoryRelationGoldenLabel = "same_story" | "different_story";

export type StoryRelationGoldenEvidence = {
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview: string;
};

/** Eval-only contract. It is not a runtime Related Topic policy. */
export type StoryRelationGoldenCase = {
  readonly caseId: string;
  readonly expected: StoryRelationGoldenLabel;
  readonly relatedOnlyHardNegative: boolean;
  readonly left: StoryRelationGoldenEvidence;
  readonly right: StoryRelationGoldenEvidence;
};

export type StoryRelationEvalPrediction = {
  readonly caseId: string;
  readonly sameStory: boolean;
};

export type StoryRelationEvalMetrics = {
  readonly truePositiveCount: number;
  readonly falsePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly trueNegativeCount: number;
  readonly precision?: number;
  readonly recall?: number;
  readonly relatedOnlyFalseMergeCount: number;
};

export type StoryRelationEvalResult = {
  readonly datasetVersion: string;
  readonly caseResults: readonly {
    readonly caseId: string;
    readonly expected: StoryRelationGoldenLabel;
    readonly predicted: StoryRelationGoldenLabel;
    readonly correct: boolean;
  }[];
  readonly metrics: StoryRelationEvalMetrics;
};

export const evaluateStoryRelationGoldenCases = (params: {
  readonly datasetVersion: string;
  readonly cases: readonly StoryRelationGoldenCase[];
  readonly predictions: readonly StoryRelationEvalPrediction[];
}): StoryRelationEvalResult => {
  assertUniqueCaseIds(params.cases);
  const predictionsByCaseId = new Map<string, boolean>();
  const knownCaseIds = new Set(params.cases.map((evalCase) => evalCase.caseId));
  for (const prediction of params.predictions) {
    if (
      !knownCaseIds.has(prediction.caseId) ||
      predictionsByCaseId.has(prediction.caseId)
    ) {
      throw new Error("Story relation eval predictions must match each case once");
    }
    predictionsByCaseId.set(prediction.caseId, prediction.sameStory);
  }
  if (predictionsByCaseId.size !== params.cases.length) {
    throw new Error("Story relation eval predictions must match each case once");
  }

  let truePositiveCount = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;
  let trueNegativeCount = 0;
  let relatedOnlyFalseMergeCount = 0;
  const caseResults = params.cases.map((evalCase) => {
    const predictedSameStory = predictionsByCaseId.get(evalCase.caseId);
    if (predictedSameStory === undefined) {
      throw new Error("Story relation eval prediction is missing");
    }
    const expectedSameStory = evalCase.expected === "same_story";
    if (expectedSameStory && predictedSameStory) truePositiveCount += 1;
    if (!expectedSameStory && predictedSameStory) falsePositiveCount += 1;
    if (expectedSameStory && !predictedSameStory) falseNegativeCount += 1;
    if (!expectedSameStory && !predictedSameStory) trueNegativeCount += 1;
    if (
      evalCase.relatedOnlyHardNegative &&
      !expectedSameStory &&
      predictedSameStory
    ) {
      relatedOnlyFalseMergeCount += 1;
    }
    return {
      caseId: evalCase.caseId,
      expected: evalCase.expected,
      predicted: predictedSameStory ? "same_story" : "different_story",
      correct: expectedSameStory === predictedSameStory,
    } as const;
  });
  const predictedPositiveCount = truePositiveCount + falsePositiveCount;
  const actualPositiveCount = truePositiveCount + falseNegativeCount;

  return {
    datasetVersion: params.datasetVersion,
    caseResults,
    metrics: {
      truePositiveCount,
      falsePositiveCount,
      falseNegativeCount,
      trueNegativeCount,
      ...(predictedPositiveCount === 0
        ? {}
        : { precision: truePositiveCount / predictedPositiveCount }),
      ...(actualPositiveCount === 0
        ? {}
        : { recall: truePositiveCount / actualPositiveCount }),
      relatedOnlyFalseMergeCount,
    },
  };
};

const assertUniqueCaseIds = (
  cases: readonly StoryRelationGoldenCase[],
): void => {
  if (new Set(cases.map((evalCase) => evalCase.caseId)).size !== cases.length) {
    throw new Error("Story relation golden case ids must be unique");
  }
};
