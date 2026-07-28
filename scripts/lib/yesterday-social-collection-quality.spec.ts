import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
} from "./clean-real-day-collection-report";
import { evaluateYesterdaySocialProviderReadiness } from "./yesterday-social-collection-quality";

describe("yesterday social required-provider readiness", () => {
  it("passes only when every required provider appears exactly once with data", () => {
    const readiness = evaluateYesterdaySocialProviderReadiness({
      expectedCollectionDate: "2026-07-27",
      report: qualityReport(),
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.readyProviderKeys).toEqual(
      defaultCleanRealDayCollectionProviderKeys,
    );
    expect(readiness.barrierMessage).toBeNull();
  });

  it.each(defaultCleanRealDayCollectionProviderKeys)(
    "fails closed and names missing provider %s",
    (providerKey) => {
      const readiness = evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: "2026-07-27",
        report: qualityReport(
          defaultCleanRealDayCollectionProviderKeys.filter(
            (candidate) => candidate !== providerKey,
          ),
        ),
      });

      expect(readiness.ready).toBe(false);
      expect(readiness.missingProviderKeys).toEqual([providerKey]);
      expect(readiness.barrierMessage).toContain(`missing=${providerKey}`);
    },
  );

  it("fails closed for empty, duplicate, stale, and absent reports", () => {
    const empty = qualityReport();
    empty.providerReports[1] = {
      ...empty.providerReports[1]!,
      feedItemCount: 0,
    };
    const duplicate = qualityReport();
    duplicate.providerReports.push({ ...duplicate.providerReports[0]! });

    expect(
      evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: "2026-07-27",
        report: empty,
      }).emptyProviderKeys,
    ).toEqual(["hacker-news"]);
    expect(
      evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: "2026-07-27",
        report: duplicate,
      }).duplicateProviderKeys,
    ).toEqual(["github-trending-page"]);
    expect(
      evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: "2026-07-28",
        report: qualityReport(),
      }).ready,
    ).toBe(false);
    expect(
      evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: "2026-07-27",
        report: null,
      }).ready,
    ).toBe(false);
  });
});

function qualityReport(
  providerKeys: readonly CleanRealDayCollectionProviderKey[] =
    defaultCleanRealDayCollectionProviderKeys,
): {
  collectionDate: string;
  providerReports: {
    providerKey: CleanRealDayCollectionProviderKey;
    feedItemCount: number;
  }[];
} {
  return {
    collectionDate: "2026-07-27",
    providerReports: providerKeys.map((providerKey) => ({
      providerKey,
      feedItemCount: 10,
    })),
  };
}
