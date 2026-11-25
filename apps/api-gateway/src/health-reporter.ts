import { Inject, Injectable, Optional } from '@nestjs/common';
import type { SourceReadinessProfile } from '@social-monitor/ingestion/ports';
import { resolveRuntimeProfile } from '@social-monitor/platform-config';
import {
  MetricsRuntime,
  type MetricsRuntimeHealth,
  resolveMetricsRuntimeConfig,
} from '@social-monitor/platform-metrics';
import type { Clock } from '@social-monitor/shared-kernel';
import {
  apiGatewayUsesPrismaPersistence,
  readApiGatewayRuntimeModes,
} from './api-gateway-runtime-readiness';

export type HealthResponse = {
  readonly status: "ok";
  readonly service: "api-gateway";
  readonly checkedAt: string;
  readonly uptimeSeconds: number;
};

type ReadinessCheck = {
  readonly name: string;
  readonly status: "ok" | "degraded";
  readonly detail: string;
};

type MetricsReadiness = {
  readonly health: MetricsRuntimeHealth;
  readonly check: ReadinessCheck;
};

export type ReadinessResponse = HealthResponse & {
  readonly runtime: {
    readonly nodeEnv: string;
    readonly runtimeProfile: string;
    readonly persistence: {
      readonly monitoring: string;
      readonly feed: string;
      readonly ingestionSupport: string;
      readonly summary: string;
      readonly delivery: string;
      readonly identity: string;
      readonly usage: string;
    };
    readonly workerLoops: {
      readonly ingestionScanScheduler: string;
      readonly ingestionScanQueueDrain: string;
      readonly intelligenceSummaryJob: string;
      readonly intelligenceSummaryQueueDrain: string;
      readonly deliveryDigestScheduler: string;
      readonly deliveryAttemptDispatch: string;
      readonly deliveryAttemptQueueDrain: string;
      readonly deliverySummaryReadyEventDrain: string;
      readonly eventRelay: string;
    };
    readonly queues: {
      readonly monitoringScanPublisher: string;
      readonly ingestionScanReader: string;
      readonly summaryJobPublisher: string;
      readonly intelligenceSummaryReader: string;
      readonly deliveryAttemptPublisher: string;
      readonly deliveryAttemptReader: string;
      readonly deliverySummaryReadyEventReader: string;
    };
    readonly providers: {
      readonly deliveryWebhook: string;
      readonly deliveryEnabledChannels: string;
    };
    readonly metrics: MetricsRuntimeHealth;
  };
  readonly capabilities: {
    readonly rest: "enabled";
    readonly websocket: "enabled";
    readonly openapi: "enabled";
    readonly workerApps: readonly string[];
    readonly enabledBetaSources: readonly string[];
    readonly fixtureReadySources: readonly string[];
    readonly liveBetaReadySources: readonly string[];
    readonly deferredSources: readonly string[];
  };
  readonly checks: readonly ReadinessCheck[];
};

export type UptimeSecondsReader = () => number;
export type ApiGatewayDatabaseReadinessResult = "queried" | "skipped";
export type ApiGatewayDatabaseReadiness = {
  check(): Promise<ApiGatewayDatabaseReadinessResult>;
};

export const API_GATEWAY_HEALTH_ENV = Symbol("API_GATEWAY_HEALTH_ENV");
export const API_GATEWAY_HEALTH_CLOCK = Symbol("API_GATEWAY_HEALTH_CLOCK");
export const API_GATEWAY_UPTIME_SECONDS = Symbol("API_GATEWAY_UPTIME_SECONDS");
export const API_GATEWAY_SOURCE_READINESS_PROFILES = Symbol(
  "API_GATEWAY_SOURCE_READINESS_PROFILES",
);
export const API_GATEWAY_DATABASE_READINESS = Symbol(
  "API_GATEWAY_DATABASE_READINESS",
);

export function createApiGatewayDatabaseReadiness(
  env: NodeJS.ProcessEnv,
  probe: () => Promise<void>,
): ApiGatewayDatabaseReadiness {
  return {
    check: async (): Promise<ApiGatewayDatabaseReadinessResult> => {
      if (!apiGatewayUsesPrismaPersistence(env)) {
        return "skipped";
      }
      await probe();
      return "queried";
    },
  };
}

@Injectable()
export class ApiGatewayHealthReporter {
  constructor(
    @Inject(API_GATEWAY_HEALTH_ENV)
    private readonly env: NodeJS.ProcessEnv,
    @Inject(API_GATEWAY_HEALTH_CLOCK)
    private readonly clock: Clock,
    @Inject(API_GATEWAY_UPTIME_SECONDS)
    private readonly uptimeSeconds: UptimeSecondsReader,
    @Inject(API_GATEWAY_SOURCE_READINESS_PROFILES)
    private readonly sourceReadinessProfiles: readonly SourceReadinessProfile[],
    @Inject(API_GATEWAY_DATABASE_READINESS)
    @Optional()
    private readonly databaseReadiness?: ApiGatewayDatabaseReadiness,
    @Optional()
    private readonly metricsRuntime?: MetricsRuntime,
  ) {}

  health(): HealthResponse {
    return this.ok();
  }

  async ready(): Promise<ReadinessResponse> {
    const databaseReadiness = await this.checkDatabaseReadiness();
    const runtimeProfile = resolveRuntimeProfile(this.env);
    const { persistence, workerLoops, queues, providers } =
      readApiGatewayRuntimeModes(this.env);
    const metricsReadiness = this.metricsReadiness();
    return {
      ...this.ok(),
      runtime: {
        nodeEnv: this.env.NODE_ENV ?? "development",
        runtimeProfile,
        persistence,
        workerLoops,
        queues,
        providers,
        metrics: metricsReadiness.health,
      },
      capabilities: {
        rest: "enabled",
        websocket: "enabled",
        openapi: "enabled",
        workerApps: [
          "ingestion-worker",
          "intelligence-worker",
          "delivery-service",
          "event-relay",
        ],
        enabledBetaSources: this.sourceReadinessProfiles
          .filter((profile) => profile.state === "enabled_beta")
          .map((profile) => profile.providerKey)
          .sort(),
        fixtureReadySources: this.sourceReadinessProfiles
          .filter((profile) => profile.runtimeReadiness === "fixture_ready")
          .map((profile) => profile.providerKey)
          .sort(),
        liveBetaReadySources: this.sourceReadinessProfiles
          .filter((profile) => profile.runtimeReadiness === "live_beta_ready")
          .map((profile) => profile.providerKey)
          .sort(),
        deferredSources: this.sourceReadinessProfiles
          .filter((profile) => profile.state !== "enabled_beta")
          .map((profile) => profile.providerKey)
          .sort(),
      },
      checks: [
        {
          name: "api_gateway",
          status: "ok",
          detail: "Nest application initialized.",
        },
        {
          name: "source_capability_profiles",
          status: "ok",
          detail: "Source readiness profiles loaded.",
        },
        {
          name: "postgres_runtime_pool",
          status: "ok",
          detail:
            databaseReadiness === "queried"
              ? "A query completed through the bounded shared Prisma pool."
              : "Database dependency not required: all API gateway Prisma persistence selectors are disabled; PostgreSQL probe was not executed.",
        },
        metricsReadiness.check,
      ],
    };
  }

  private ok(): HealthResponse {
    return {
      status: "ok",
      service: "api-gateway",
      checkedAt: this.clock.now().toISOString(),
      uptimeSeconds: Math.floor(this.uptimeSeconds()),
    };
  }

  private async checkDatabaseReadiness(): Promise<ApiGatewayDatabaseReadinessResult> {
    if (this.databaseReadiness !== undefined) {
      return this.databaseReadiness.check();
    }
    if (apiGatewayUsesPrismaPersistence(this.env)) {
      throw new Error(
        "API gateway PostgreSQL readiness probe is not configured",
      );
    }
    return "skipped";
  }

  private requireMetricsHealth(): MetricsRuntimeHealth {
    const health = this.metricsRuntime?.health();
    if (health === undefined) {
      throw new Error("API gateway metrics runtime is not configured");
    }
    if (health.lifecycle !== "active") {
      throw new Error("API gateway metrics runtime is not active");
    }
    if (resolveRuntimeProfile(this.env) === "beta" && health.mode !== "otlp") {
      throw new Error("Beta API gateway metrics runtime must use OTLP");
    }
    return health;
  }

  private metricsReadiness(): MetricsReadiness {
    const health = this.requireMetricsHealth();
    return {
      health,
      check: {
        name: "metrics_exporter",
        ...this.metricsExportCheck(health),
      },
    };
  }

  private metricsExportCheck(
    health: MetricsRuntimeHealth,
  ): Pick<ReadinessCheck, "status" | "detail"> {
    if (health.mode !== "otlp") {
      return {
        status: "ok",
        detail: "Deterministic in-memory metrics runtime active.",
      };
    }
    const degradedDetail = this.degradedOtlpExportDetail(health);
    if (degradedDetail !== undefined) {
      return {
        status: "degraded",
        detail: degradedDetail,
      };
    }
    return {
      status: "ok",
      detail: `OTLP metrics runtime active; last successful export: ${health.lastExportAt}.`,
    };
  }

  private degradedOtlpExportDetail(
    health: MetricsRuntimeHealth,
  ): string | undefined {
    const config = resolveMetricsRuntimeConfig(this.env, health.serviceName);
    const freshnessWindowMillis =
      config.exportIntervalMillis + config.exportTimeoutMillis;
    if (health.exportState === "failed") {
      return "OTLP metrics export not_ready: latest export failed; metrics export is non-blocking for API readiness.";
    }
    if (health.exportState === "pending") {
      const graceDetail =
        this.uptimeSeconds() * 1_000 > freshnessWindowMillis
          ? "beyond startup grace"
          : "within startup grace";
      return `OTLP metrics export not_ready: export is pending ${graceDetail}; metrics export is non-blocking for API readiness.`;
    }
    if (health.exportState !== "succeeded") {
      return `OTLP metrics export not_ready: export state ${health.exportState} is invalid; metrics export is non-blocking for API readiness.`;
    }
    const lastSuccessfulExportAt = Date.parse(health.lastExportAt ?? "");
    const now = this.clock.now().getTime();
    if (
      !Number.isFinite(lastSuccessfulExportAt) ||
      lastSuccessfulExportAt > now ||
      now - lastSuccessfulExportAt > freshnessWindowMillis
    ) {
      return "OTLP metrics export not_ready: last successful export is missing or stale; metrics export is non-blocking for API readiness.";
    }
    return undefined;
  }


}
