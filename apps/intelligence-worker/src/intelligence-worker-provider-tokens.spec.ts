import { resolveIntelligencePeriodicReaderSummarySchedulerOptions,
  resolveIntelligenceReaderSummaryJobLoopOptions,
  resolveIntelligenceSummaryJobLoopOptions } from "./intelligence-worker-provider-tokens";

describe("reader summary due poller defaults", () => {
  it("enables primary reader due polling with RabbitMQ without enabling the generic poller", () => {
    const env = { NODE_ENV: "production", READER_VALUE_MODE: "jev_primary_v3",
      INTELLIGENCE_SUMMARY_QUEUE_READER: "rabbitmq" };
    expect(resolveIntelligenceReaderSummaryJobLoopOptions(env).enabled).toBe(true);
    expect(resolveIntelligenceSummaryJobLoopOptions(env).enabled).toBe(false);
  });
  it("keeps isolated tests and legacy rollback disabled unless explicitly enabled", () => {
    expect(resolveIntelligenceReaderSummaryJobLoopOptions({ NODE_ENV: "test" }).enabled)
      .toBe(false);
    expect(resolveIntelligenceReaderSummaryJobLoopOptions({ NODE_ENV: "production",
      READER_VALUE_MODE: "legacy_v2", INTELLIGENCE_SUMMARY_QUEUE_READER: "rabbitmq" }).enabled)
      .toBe(false);
  });
});

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
