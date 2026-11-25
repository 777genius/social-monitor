import {
  providerNameForEvidence,
  readerSummaryPeriodQuery,
} from "./relevance-reader-summary-evidence-support";
import { readerSummaryEvidenceTestPeriod } from "./relevance-reader-summary-evidence-test-fixtures";

describe("relevance reader summary evidence support", () => {
  it("labels Hacker News canonical items received through RSS at the adapter boundary", () => {
    expect(
      providerNameForEvidence({
        providerKey: "rss",
        canonicalUrl: "https://news.ycombinator.com/item?id=48816039",
      }),
    ).toBe("Hacker News via RSS");
    expect(
      providerNameForEvidence({
        providerKey: "rss",
        canonicalUrl: "https://example.com/editorial-story",
      }),
    ).toBe("RSS");
  });

  it("builds non-hybrid published and observed period queries", () => {
    const base = {
      tenantId: "tenant-1" as never,
      workspaceId: "workspace-1" as never,
      scope: { type: "workspace" } as const,
      period: readerSummaryEvidenceTestPeriod,
      maxItems: 10,
      observedThrough: new Date("2026-06-25T00:00:00.000Z"),
    };

    expect(readerSummaryPeriodQuery(base)).toEqual({
      publishedAtOrAfter: readerSummaryEvidenceTestPeriod.startedAt,
      publishedBefore: readerSummaryEvidenceTestPeriod.endedAt,
      observedAtOrBefore: new Date("2026-06-25T00:00:00.000Z"),
    });
    expect(
      readerSummaryPeriodQuery({ ...base, timestampPolicy: "observed_at" }),
    ).toEqual({
      observedAtOrAfter: readerSummaryEvidenceTestPeriod.startedAt,
      observedBefore: readerSummaryEvidenceTestPeriod.endedAt,
      observedAtOrBefore: new Date("2026-06-25T00:00:00.000Z"),
    });
  });
});
