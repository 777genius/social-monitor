const primaryProviderKeys = ["reddit", "x-twitter"] as const;

export type AggregateCollectionQualityProof = {
  readonly artifactFormat: string;
  readonly collectionDate: string;
  readonly primarySourceCoverage: readonly string[];
  readonly providerReports: readonly {
    readonly providerKey: string;
    readonly feedItemCount: number;
    readonly visibleFeedItemCount: number;
  }[];
  readonly qualityGates: Readonly<Record<string, boolean>>;
  readonly collectionBlockingPassed: boolean;
  readonly summaryQualityVerified: boolean;
  readonly completionStatus: string;
};

export type CleanRealDayCollectionEvidenceVerdict = {
  readonly targetedCollectionPassed: boolean;
  readonly aggregateCollectionProofPassed: boolean;
  readonly collectionEvidencePassed: boolean;
  readonly aggregateCompensationApplied: boolean;
  readonly aggregateProviderCounts: Readonly<Record<string, number>>;
  readonly aggregateProofGates: Readonly<Record<string, boolean>>;
};

export function targetWindowHasEveryPrimaryProvider(
  providerCounts: Readonly<Record<string, number>>,
): boolean {
  return primaryProviderKeys.every(
    (providerKey) => (providerCounts[providerKey] ?? 0) > 0,
  );
}

export function evaluateCleanRealDayCollectionEvidence(params: {
  readonly expectedCollectionDate: string;
  readonly targetedBlockingPassed: boolean;
  readonly targetedQualityGates: Readonly<Record<string, boolean>>;
  readonly targetedScansSucceeded: boolean;
  readonly aggregate: AggregateCollectionQualityProof;
}): CleanRealDayCollectionEvidenceVerdict {
  const aggregateProviderCounts = Object.fromEntries(
    params.aggregate.providerReports.map((provider) => [
      provider.providerKey,
      provider.visibleFeedItemCount,
    ]),
  );
  const aggregateProofGates = {
    artifactFormatValid:
      params.aggregate.artifactFormat ===
      "yesterday-social-collection-quality-report-v1",
    exactCollectionDate:
      params.aggregate.collectionDate === params.expectedCollectionDate,
    collectionBlockingPassed:
      params.aggregate.collectionBlockingPassed === true,
    qualityGatesPresent:
      Object.keys(params.aggregate.qualityGates).length > 0,
    everyQualityGatePassed: Object.values(
      params.aggregate.qualityGates,
    ).every(Boolean),
    globalXCollectionSucceeded:
      params.aggregate.qualityGates.globalXCollectionSucceeded === true,
    xTwitterMeetsProductionMinimum:
      params.aggregate.qualityGates
        .xTwitterVisibleFeedItemsMeetProductionMinimum === true,
    allExpectedPrimarySourcesPresent:
      params.aggregate.qualityGates.allExpectedPrimarySourcesPresent === true,
    primarySourceCoveragePresent: primaryProviderKeys.every((providerKey) =>
      params.aggregate.primarySourceCoverage.includes(providerKey),
    ),
    primaryProviderInventoryPresent:
      targetWindowHasEveryPrimaryProvider(aggregateProviderCounts),
  };
  const aggregateCollectionProofPassed = Object.values(
    aggregateProofGates,
  ).every(Boolean);
  const targetedCollectionPassed =
    params.targetedBlockingPassed &&
    Object.keys(params.targetedQualityGates).length > 0 &&
    Object.values(params.targetedQualityGates).every(Boolean) &&
    params.targetedScansSucceeded;

  return {
    targetedCollectionPassed,
    aggregateCollectionProofPassed,
    collectionEvidencePassed:
      targetedCollectionPassed || aggregateCollectionProofPassed,
    aggregateCompensationApplied:
      !targetedCollectionPassed && aggregateCollectionProofPassed,
    aggregateProviderCounts,
    aggregateProofGates,
  };
}
