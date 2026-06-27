import { resolveIntelligencePeriodicReaderSummarySchedulerOptions } from "./intelligence-worker-provider-tokens";

describe("resolveIntelligencePeriodicReaderSummarySchedulerOptions", () => {
  it("defaults periodic reader summaries to the shared 06:00 UTC ready time", () => {
    expect(
      resolveIntelligencePeriodicReaderSummarySchedulerOptions({}).readyAtUtc,
    ).toEqual({ hour: 6, minute: 0 });
  });

  it("parses an explicit HH:mm UTC ready time", () => {
    expect(
      resolveIntelligencePeriodicReaderSummarySchedulerOptions({
        INTELLIGENCE_PERIODIC_READER_SUMMARY_READY_AT_UTC: "05:30",
      }).readyAtUtc,
    ).toEqual({ hour: 5, minute: 30 });
  });

  it("rejects unsupported ready time values", () => {
    expect(() =>
      resolveIntelligencePeriodicReaderSummarySchedulerOptions({
        INTELLIGENCE_PERIODIC_READER_SUMMARY_READY_AT_UTC: "5:30",
      }),
    ).toThrow(
      "INTELLIGENCE_PERIODIC_READER_SUMMARY_READY_AT_UTC must use HH:mm UTC format",
    );
  });
});
