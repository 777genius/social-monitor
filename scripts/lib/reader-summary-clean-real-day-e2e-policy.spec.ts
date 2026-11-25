import {
  evaluateCleanRealDayCollectionEvidence,
  targetWindowHasEveryPrimaryProvider,
  type AggregateCollectionQualityProof,
} from "./reader-summary-clean-real-day-e2e-policy";

describe("clean real-day E2E provider policy", () => {
  it("accepts a complete target day even when a catch-up fresh window is partial", () => {
    expect(
      targetWindowHasEveryPrimaryProvider({ reddit: 341, "x-twitter": 79 }),
    ).toBe(true);
  });

  it("fails closed when a primary provider is absent from the target day", () => {
    expect(targetWindowHasEveryPrimaryProvider({ "x-twitter": 72 })).toBe(
      false,
    );
  });

  it("accepts exact-day aggregate database proof after one targeted scan fails", () => {
    const verdict = evaluateCleanRealDayCollectionEvidence({
      expectedCollectionDate: "2026-08-28",
      targetedBlockingPassed: false,
      targetedQualityGates: {
        everyRequestedProviderSucceeded: false,
      },
      targetedScansSucceeded: false,
      aggregate: aggregateProof(),
    });

    expect(verdict).toMatchObject({
      targetedCollectionPassed: false,
      aggregateCollectionProofPassed: true,
      collectionEvidencePassed: true,
      aggregateCompensationApplied: true,
      aggregateProviderCounts: { reddit: 377, "x-twitter": 100 },
    });
  });

  it.each([
    ["wrong date", { collectionDate: "2026-08-27" }],
    ["failed aggregate gate", { qualityGates: { xReady: false } }],
    ["missing X inventory", { providerReports: [provider("reddit", 377)] }],
  ])("fails closed when aggregate proof has %s", (_label, override) => {
    const verdict = evaluateCleanRealDayCollectionEvidence({
      expectedCollectionDate: "2026-08-28",
      targetedBlockingPassed: false,
      targetedQualityGates: {
        everyRequestedProviderSucceeded: false,
      },
      targetedScansSucceeded: false,
      aggregate: { ...aggregateProof(), ...override },
    });

    expect(verdict.collectionEvidencePassed).toBe(false);
    expect(verdict.aggregateCompensationApplied).toBe(false);
  });

  it("does not require aggregate compensation when targeted collection passes", () => {
    const verdict = evaluateCleanRealDayCollectionEvidence({
      expectedCollectionDate: "2026-08-28",
      targetedBlockingPassed: true,
      targetedQualityGates: { everyRequestedProviderSucceeded: true },
      targetedScansSucceeded: true,
      aggregate: {
        ...aggregateProof(),
        collectionDate: "2026-08-27",
      },
    });

    expect(verdict).toMatchObject({
      targetedCollectionPassed: true,
      collectionEvidencePassed: true,
      aggregateCompensationApplied: false,
    });
  });
});

function aggregateProof(): AggregateCollectionQualityProof {
  return {
    artifactFormat: "yesterday-social-collection-quality-report-v1",
    collectionDate: "2026-08-28",
    primarySourceCoverage: ["reddit", "x-twitter"],
    providerReports: [provider("reddit", 377), provider("x-twitter", 100)],
    qualityGates: {
      globalXCollectionSucceeded: true,
      xTwitterVisibleFeedItemsMeetProductionMinimum: true,
      allExpectedPrimarySourcesPresent: true,
    },
    collectionBlockingPassed: true,
    summaryQualityVerified: true,
    completionStatus: "collection_and_summary_quality_verified",
  };
}

function provider(providerKey: string, count: number) {
  return {
    providerKey,
    feedItemCount: count,
    visibleFeedItemCount: count,
  };
}
