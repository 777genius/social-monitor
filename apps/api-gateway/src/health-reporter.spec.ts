import type {
  SourceReadinessFreshnessGuard,
  SourceReadinessProfile,
} from "@social-monitor/ingestion/ports";
import {
  InMemoryMetricsRecorder,
  MetricsRuntime,
  type MetricsRuntimeHealth,
} from "@social-monitor/platform-metrics";
import { FixedClock } from "@social-monitor/shared-kernel";

import {
  ApiGatewayHealthReporter,
  createApiGatewayDatabaseReadiness,
} from "./health-reporter";

const databaseReady = { check: jest.fn(async () => "queried" as const) };
const metricsReady = new MetricsRuntime({
  serviceName: "api-gateway",
  mode: "otlp",
  recorder: new InMemoryMetricsRecorder(),
  exportHealth: () => ({
    exportState: "succeeded",
    lastExportAt: "2026-01-02T03:04:00.000Z",
  }),
  forceFlush: async () => undefined,
  shutdown: async () => undefined,
});
const testMetricsReady = new MetricsRuntime({
  serviceName: "api-gateway",
  mode: "in-memory",
  recorder: new InMemoryMetricsRecorder(),
  exportHealth: () => ({
    exportState: "not_applicable",
    lastExportAt: undefined,
  }),
  forceFlush: async () => undefined,
  shutdown: async () => undefined,
});

function metricsRuntimeWithExportHealth(
  exportState: MetricsRuntimeHealth["exportState"],
  lastExportAt?: string,
): MetricsRuntime {
  return new MetricsRuntime({
    serviceName: "api-gateway",
    mode: "otlp",
    recorder: new InMemoryMetricsRecorder(),
    exportHealth: () => ({ exportState, lastExportAt }),
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  });
}

const readinessProfiles: readonly SourceReadinessProfile[] = [
  {
    providerKey: "reddit",
    state: "enabled_beta",
    runtimeReadiness: "fixture_ready",
    liveBetaBlockers: ["live credentials pending"],
    liveEvidenceRequirements: [],
    freshnessGuard: makeFreshnessGuard({
      maxStalenessSeconds: 900,
      minimumScanIntervalSeconds: 900,
      skipRecentlyScanned: true,
    }),
    acquisitionMode: "api",
    approvalOwner: "source-owner",
    termsNotes: "fixture only",
    credentialOwnership: "platform",
    quotaModel: "per_app",
    retentionNotes: "none",
    cursorModel: "time",
    identityStrategy: ["provider id"],
    supportedContentUnits: ["post"],
    unsupportedContentUnits: ["comment"],
    estimatedCostPerScan: "low",
    betaEnablementCriteria: ["fixture certification"],
    rollbackPlan: "disable provider",
  },
  {
    providerKey: "mastodon",
    state: "profiled",
    runtimeReadiness: "deferred",
    liveBetaBlockers: ["scope pending"],
    liveEvidenceRequirements: [],
    freshnessGuard: makeFreshnessGuard({
      maxStalenessSeconds: 86_400,
      minimumScanIntervalSeconds: 86_400,
      skipRecentlyScanned: false,
    }),
    acquisitionMode: "api",
    approvalOwner: "source-owner",
    termsNotes: "not enabled",
    credentialOwnership: "user",
    quotaModel: "per_tenant",
    retentionNotes: "none",
    cursorModel: "page_token",
    identityStrategy: ["instance", "provider id"],
    supportedContentUnits: ["post"],
    unsupportedContentUnits: ["media"],
    estimatedCostPerScan: "unknown",
    betaEnablementCriteria: ["owner approval"],
    rollbackPlan: "keep deferred",
  },
];

function makeFreshnessGuard(
  overrides: Pick<
    SourceReadinessFreshnessGuard,
    "maxStalenessSeconds" | "minimumScanIntervalSeconds" | "skipRecentlyScanned"
  >,
): SourceReadinessFreshnessGuard {
  return {
    ...overrides,
    scanHistoryRequired: true,
    cursorResumeRequired: true,
    rateLimitBackoffRequired: true,
    staleReadModelState: "stale",
    providerFailureHealthState: "degraded",
    signals: ["fixture_freshness_guard"],
  };
}

const betaDurableEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
  DATABASE_URL: "postgresql://social-monitor.test/db",
  RABBITMQ_URL: "amqp://social-monitor.test",
  MONITORING_PERSISTENCE: "prisma",
  FEED_PERSISTENCE: "prisma",
  INGESTION_SUPPORT_PERSISTENCE: "prisma",
  SUMMARY_PERSISTENCE: "prisma",
  DELIVERY_PERSISTENCE: "prisma",
  IDENTITY_PERSISTENCE: "prisma",
  USAGE_PERSISTENCE: "prisma",
  MONITORING_SCAN_QUEUE: "rabbitmq",
  INGESTION_SCAN_QUEUE_READER: "rabbitmq",
  SUMMARY_JOB_QUEUE_MODE: "rabbitmq",
  INTELLIGENCE_SUMMARY_QUEUE_READER: "rabbitmq",
  DELIVERY_ATTEMPT_DISPATCH_QUEUE: "rabbitmq",
  DELIVERY_ATTEMPT_QUEUE_READER: "rabbitmq",
  DELIVERY_SUMMARY_READY_EVENT_READER: "rabbitmq",
  DELIVERY_WEBHOOK_PROVIDER: "http",
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "http://otel-collector:4318/v1/metrics",
};

describe("ApiGatewayHealthReporter", () => {
  it("builds deterministic health responses from injected clock and uptime reader", () => {
    const reporter = new ApiGatewayHealthReporter(
      { NODE_ENV: "test" },
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 12.7,
      readinessProfiles,
      databaseReady,
      metricsReady,
    );

    expect(reporter.health()).toEqual({
      status: "ok",
      service: "api-gateway",
      checkedAt: "2026-01-02T03:04:05.000Z",
      uptimeSeconds: 12,
    });
  });

  it("builds readiness metadata only after the bounded database probe succeeds", async () => {
    databaseReady.check.mockClear();
    const reporter = new ApiGatewayHealthReporter(
      {
        ...betaDurableEnv,
        DELIVERY_ENABLED_CHANNELS: "webhook",
      },
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 3,
      readinessProfiles,
      databaseReady,
      metricsReady,
    );

    await expect(reporter.ready()).resolves.toEqual(
      expect.objectContaining({
        runtime: expect.objectContaining({
          nodeEnv: "production",
          runtimeProfile: "beta",
          persistence: {
            monitoring: "prisma",
            feed: "prisma",
            ingestionSupport: "prisma",
            summary: "prisma",
            delivery: "prisma",
            identity: "prisma",
            usage: "prisma",
          },
          queues: expect.objectContaining({
            monitoringScanPublisher: "rabbitmq",
            deliveryAttemptReader: "rabbitmq",
          }),
          providers: {
            deliveryWebhook: "http",
            deliveryEnabledChannels: "webhook",
          },
          metrics: {
            serviceName: "api-gateway",
            mode: "otlp",
            lifecycle: "active",
            exportState: "succeeded",
            lastExportAt: "2026-01-02T03:04:00.000Z",
          },
        }),
        capabilities: expect.objectContaining({
          rest: "enabled",
          websocket: "enabled",
          openapi: "enabled",
          enabledBetaSources: ["reddit"],
          fixtureReadySources: ["reddit"],
          liveBetaReadySources: [],
          deferredSources: ["mastodon"],
        }),
      }),
    );
    expect(databaseReady.check).toHaveBeenCalledTimes(1);
  });

  it("reports memory-only readiness as ok without probing PostgreSQL", async () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    const probe = jest.fn().mockResolvedValue(undefined);
    const reporter = new ApiGatewayHealthReporter(
      env,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 3,
      readinessProfiles,
      createApiGatewayDatabaseReadiness(env, probe),
      testMetricsReady,
    );

    await expect(reporter.ready()).resolves.toMatchObject({
      checks: expect.arrayContaining([
        {
          name: "postgres_runtime_pool",
          status: "ok",
          detail:
            "Database dependency not required: all API gateway Prisma persistence selectors are disabled; PostgreSQL probe was not executed.",
        },
      ]),
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it.each([
    "MONITORING_PERSISTENCE",
    "FEED_PERSISTENCE",
    "INGESTION_SUPPORT_PERSISTENCE",
    "SUMMARY_PERSISTENCE",
    "DELIVERY_PERSISTENCE",
    "IDENTITY_PERSISTENCE",
    "USAGE_PERSISTENCE",
    "RELEVANCE_PERSISTENCE",
    "SUBSCRIPTIONS_PERSISTENCE",
    "SOCIAL_RESEARCH_RESULT_CACHE",
  ])("probes PostgreSQL when %s enables Prisma", async (settingName) => {
    const probe = jest.fn().mockResolvedValue(undefined);
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: "postgresql://social-monitor.test/db",
      [settingName]: "prisma",
    };
    const readiness = createApiGatewayDatabaseReadiness(env, probe);

    await expect(readiness.check()).resolves.toBe("queried");
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Prisma is enabled without a configured readiness probe", async () => {
    const reporter = new ApiGatewayHealthReporter(
      {
        DATABASE_URL: "postgresql://social-monitor.test/db",
        MONITORING_PERSISTENCE: "prisma",
      },
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 3,
      readinessProfiles,
    );

    await expect(reporter.ready()).rejects.toThrow(
      "PostgreSQL readiness probe is not configured",
    );
  });

  it("reports resolved beta delivery channels when the selector is omitted", async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 3,
      readinessProfiles,
      databaseReady,
      metricsReady,
    );

    await expect(reporter.ready()).resolves.toMatchObject({
      runtime: { providers: { deliveryEnabledChannels: "webhook" } },
    });
  });

  it("fails beta readiness when the metrics runtime is not wired", async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 3,
      readinessProfiles,
      databaseReady,
    );

    await expect(reporter.ready()).rejects.toThrow(
      "API gateway metrics runtime is not configured",
    );
  });

  it("allows a pending OTLP export only within bounded startup grace", async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 89,
      readinessProfiles,
      databaseReady,
      metricsRuntimeWithExportHealth("pending"),
    );

    await expect(reporter.ready()).resolves.toMatchObject({
      runtime: {
        metrics: {
          exportState: "pending",
          lastExportAt: undefined,
        },
      },
    });
  });

  it("fails readiness when OTLP remains pending beyond startup grace", async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 91,
      readinessProfiles,
      databaseReady,
      metricsRuntimeWithExportHealth("pending"),
    );

    await expect(reporter.ready()).rejects.toThrow(
      "API gateway OTLP metrics export remained pending beyond startup grace",
    );
  });

  it("fails readiness immediately after an OTLP export failure", async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 1,
      readinessProfiles,
      databaseReady,
      metricsRuntimeWithExportHealth("failed"),
    );

    await expect(reporter.ready()).rejects.toThrow(
      "API gateway OTLP metrics export failed",
    );
  });

  it("fails readiness when the last successful OTLP export is stale", async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 180,
      readinessProfiles,
      databaseReady,
      metricsRuntimeWithExportHealth("succeeded", "2026-01-02T03:02:34.000Z"),
    );

    await expect(reporter.ready()).rejects.toThrow(
      "API gateway OTLP metrics last successful export is missing or stale",
    );
  });

  it("rejects beta readiness when durable selectors would fall back to in-memory", async () => {
    const reporter = new ApiGatewayHealthReporter(
      {
        NODE_ENV: "production",
        SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
        DATABASE_URL: "postgresql://social-monitor.test/db",
        RABBITMQ_URL: "amqp://social-monitor.test",
      },
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 3,
      readinessProfiles,
      databaseReady,
    );

    await expect(reporter.ready()).rejects.toThrow(
      "MONITORING_PERSISTENCE=in-memory is not allowed when SOCIAL_MONITOR_RUNTIME_PROFILE=beta",
    );
  });

  it("fails readiness when the bounded database probe fails", async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date("2026-01-02T03:04:05.000Z")),
      () => 3,
      readinessProfiles,
      {
        check: async () => Promise.reject(new Error("SQLSTATE 53300")),
      },
    );

    await expect(reporter.ready()).rejects.toThrow("SQLSTATE 53300");
  });
});
