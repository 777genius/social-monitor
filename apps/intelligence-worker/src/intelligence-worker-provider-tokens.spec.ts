import { resolveIntelligencePeriodicReaderSummarySchedulerOptions,
  resolveIntelligenceRabbitMqReaderSummaryQueueReaderOptions,
  resolveIntelligenceRabbitMqSummaryQueueReaderOptions,
  resolveIntelligenceReaderSummaryJobLoopOptions,
  resolveIntelligenceReaderSummaryQueueDrainLoopOptions,
  resolveIntelligenceSummaryQueueDrainLoopOptions,
  resolveIntelligenceSummaryJobLoopOptions,
  resolveIntelligenceSummaryQueueReaderMode } from "./intelligence-worker-provider-tokens";

describe("summary RabbitMQ queue isolation", () => {
  const rabbitmq = { NODE_ENV: "test", INTELLIGENCE_SUMMARY_QUEUE_READER: "rabbitmq",
    RABBITMQ_URL: "amqp://127.0.0.1:1" };

  it.each([
    ["identical names", { RABBITMQ_SUMMARY_QUEUE: "shared", RABBITMQ_READER_SUMMARY_QUEUE: "shared" }],
    ["trimmed names", { RABBITMQ_SUMMARY_QUEUE: " shared ", RABBITMQ_READER_SUMMARY_QUEUE: "shared\t" }],
    ["legacy reader alias", { RABBITMQ_SUMMARY_QUEUE: "shared", RABBITMQ_BRIEFING_QUEUE: " shared " }],
    ["default reader queue", { RABBITMQ_SUMMARY_QUEUE: "jobs.reader-summary.execute",
      RABBITMQ_READER_SUMMARY_QUEUE: " " }],
    ["default summary queue", { RABBITMQ_SUMMARY_QUEUE: " ",
      RABBITMQ_READER_SUMMARY_QUEUE: "jobs.summary.execute" }],
  ] as const)("rejects %s before selecting RabbitMQ readers", (_name, names) => {
    expect(() => resolveIntelligenceSummaryQueueReaderMode({ ...rabbitmq, ...names }))
      .toThrow("must resolve to different queues");
  });

  it.each([
    ["defaults", {}, "jobs.summary.execute", "jobs.reader-summary.execute"],
    ["trimmed distinct names", { RABBITMQ_SUMMARY_QUEUE: " summaries ",
      RABBITMQ_READER_SUMMARY_QUEUE: " readers " }, "summaries", "readers"],
    ["legacy alias", { RABBITMQ_BRIEFING_QUEUE: " legacy-readers " }, "jobs.summary.execute", "legacy-readers"],
    ["canonical precedence", { RABBITMQ_SUMMARY_QUEUE: "summaries", RABBITMQ_READER_SUMMARY_QUEUE: "readers",
      RABBITMQ_BRIEFING_QUEUE: "summaries" }, "summaries", "readers"],
    ["blank canonical suppresses legacy alias", { RABBITMQ_READER_SUMMARY_QUEUE: " ",
      RABBITMQ_BRIEFING_QUEUE: "jobs.summary.execute" }, "jobs.summary.execute", "jobs.reader-summary.execute"],
  ] as const)("preserves %s", (_name, names, summary, readerSummary) => {
    const env = { ...rabbitmq, ...names };
    expect(resolveIntelligenceSummaryQueueReaderMode(env)).toBe("rabbitmq");
    expect(resolveIntelligenceRabbitMqSummaryQueueReaderOptions(env).queue).toBe(summary);
    expect(resolveIntelligenceRabbitMqReaderSummaryQueueReaderOptions(env).queue).toBe(readerSummary);
  });

  it.each([undefined, "in-memory"])("ignores unused RabbitMQ names in %s mode", (mode) => {
    expect(resolveIntelligenceSummaryQueueReaderMode({ NODE_ENV: "test",
      INTELLIGENCE_SUMMARY_QUEUE_READER: mode, RABBITMQ_SUMMARY_QUEUE: "shared",
      RABBITMQ_READER_SUMMARY_QUEUE: "shared" })).toBe("in-memory");
  });
});

describe("summary execution pause", () => {
  it("passes one explicit pause setting to both consumers while keeping their configuration enabled", () => {
    const env = { INTELLIGENCE_SUMMARY_EXECUTION_PAUSED: "true",
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP: "enabled",
      INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP: "enabled" };
    expect(resolveIntelligenceReaderSummaryJobLoopOptions(env)).toMatchObject({ enabled: true, executionPaused: true });
    expect(resolveIntelligenceReaderSummaryQueueDrainLoopOptions(env)).toMatchObject({ enabled: true, executionPaused: true });
    expect(resolveIntelligenceSummaryJobLoopOptions(env).executionPaused).toBe(true);
    expect(resolveIntelligenceSummaryQueueDrainLoopOptions(env).executionPaused).toBe(true);
    expect(resolveIntelligenceReaderSummaryJobLoopOptions({}).executionPaused).toBe(false);
    expect(resolveIntelligenceReaderSummaryQueueDrainLoopOptions({}).executionPaused).toBe(false);
    expect(resolveIntelligenceSummaryJobLoopOptions({}).executionPaused).toBe(false);
    expect(resolveIntelligenceSummaryQueueDrainLoopOptions({}).executionPaused).toBe(false);
  });

  it("rejects an invalid pause value", () => {
    const env = { INTELLIGENCE_SUMMARY_EXECUTION_PAUSED: "yes" };
    expect(() => resolveIntelligenceReaderSummaryJobLoopOptions(env)).toThrow();
    expect(() => resolveIntelligenceReaderSummaryQueueDrainLoopOptions(env)).toThrow();
    expect(() => resolveIntelligenceSummaryJobLoopOptions(env)).toThrow();
    expect(() => resolveIntelligenceSummaryQueueDrainLoopOptions(env)).toThrow();
  });
});

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
