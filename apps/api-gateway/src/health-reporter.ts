import { Inject, Injectable } from '@nestjs/common';
import { resolveDeliveryEnabledChannels } from '@social-monitor/delivery/interfaces/rest/delivery-provider-tokens';
import type { SourceReadinessProfile } from '@social-monitor/ingestion/ports';
import { resolveRuntimeProfile } from '@social-monitor/platform-config';
import type { Clock } from '@social-monitor/shared-kernel';

export type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'api-gateway';
  readonly checkedAt: string;
  readonly uptimeSeconds: number;
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
      readonly eventRelay: string;
    };
    readonly queues: {
      readonly monitoringScanPublisher: string;
      readonly ingestionScanReader: string;
      readonly summaryJobPublisher: string;
      readonly intelligenceSummaryReader: string;
      readonly deliveryAttemptPublisher: string;
      readonly deliveryAttemptReader: string;
    };
    readonly providers: {
      readonly deliveryWebhook: string;
      readonly deliveryEnabledChannels: string;
    };
  };
  readonly capabilities: {
    readonly rest: 'enabled';
    readonly websocket: 'enabled';
    readonly openapi: 'enabled';
    readonly workerApps: readonly string[];
    readonly enabledBetaSources: readonly string[];
    readonly fixtureReadySources: readonly string[];
    readonly liveBetaReadySources: readonly string[];
    readonly deferredSources: readonly string[];
  };
  readonly checks: readonly {
    readonly name: string;
    readonly status: 'ok';
    readonly detail: string;
  }[];
};

export type UptimeSecondsReader = () => number;

export const API_GATEWAY_HEALTH_ENV = Symbol('API_GATEWAY_HEALTH_ENV');
export const API_GATEWAY_HEALTH_CLOCK = Symbol('API_GATEWAY_HEALTH_CLOCK');
export const API_GATEWAY_UPTIME_SECONDS = Symbol('API_GATEWAY_UPTIME_SECONDS');
export const API_GATEWAY_SOURCE_READINESS_PROFILES = Symbol('API_GATEWAY_SOURCE_READINESS_PROFILES');

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
  ) {}

  health(): HealthResponse {
    return this.ok();
  }

  ready(): ReadinessResponse {
    return {
      ...this.ok(),
      runtime: {
        nodeEnv: this.env.NODE_ENV ?? 'development',
        runtimeProfile: resolveRuntimeProfile(this.env),
        persistence: {
          monitoring: this.envMode('MONITORING_PERSISTENCE', 'in-memory'),
          feed: this.envMode('FEED_PERSISTENCE', 'in-memory'),
          ingestionSupport: this.envMode('INGESTION_SUPPORT_PERSISTENCE', 'in-memory'),
          summary: this.envMode('SUMMARY_PERSISTENCE', 'in-memory'),
          delivery: this.envMode('DELIVERY_PERSISTENCE', 'in-memory'),
          identity: this.envMode('IDENTITY_PERSISTENCE', 'in-memory'),
          usage: this.envMode('USAGE_PERSISTENCE', 'in-memory'),
        },
        workerLoops: {
          ingestionScanScheduler: this.loopMode('INGESTION_SCAN_SCHEDULER_LOOP'),
          ingestionScanQueueDrain: this.loopMode('INGESTION_SCAN_QUEUE_DRAIN_LOOP'),
          intelligenceSummaryJob: this.summaryJobLoopMode(),
          intelligenceSummaryQueueDrain: this.summaryQueueDrainLoopMode(),
          deliveryDigestScheduler: this.loopMode('DELIVERY_DIGEST_SCHEDULER_LOOP'),
          deliveryAttemptDispatch: this.loopMode('DELIVERY_ATTEMPT_DISPATCH_LOOP'),
          deliveryAttemptQueueDrain: this.deliveryAttemptQueueDrainLoopMode(),
          eventRelay: this.loopMode('EVENT_RELAY_LOOP'),
        },
        queues: {
          monitoringScanPublisher: this.envMode('MONITORING_SCAN_QUEUE', 'in-memory'),
          ingestionScanReader: this.envMode('INGESTION_SCAN_QUEUE_READER', 'in-memory'),
          summaryJobPublisher: this.envMode('SUMMARY_JOB_QUEUE_MODE', 'in-memory'),
          intelligenceSummaryReader: this.envMode('INTELLIGENCE_SUMMARY_QUEUE_READER', 'in-memory'),
          deliveryAttemptPublisher: this.envMode('DELIVERY_ATTEMPT_DISPATCH_QUEUE', 'in-memory'),
          deliveryAttemptReader: this.envMode('DELIVERY_ATTEMPT_QUEUE_READER', 'in-memory'),
        },
        providers: {
          deliveryWebhook: this.envMode('DELIVERY_WEBHOOK_PROVIDER', 'in-memory'),
          deliveryEnabledChannels: resolveDeliveryEnabledChannels(this.env).join(','),
        },
      },
      capabilities: {
        rest: 'enabled',
        websocket: 'enabled',
        openapi: 'enabled',
        workerApps: ['ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'],
        enabledBetaSources: this.sourceReadinessProfiles
          .filter((profile) => profile.state === 'enabled_beta')
          .map((profile) => profile.providerKey)
          .sort(),
        fixtureReadySources: this.sourceReadinessProfiles
          .filter((profile) => profile.runtimeReadiness === 'fixture_ready')
          .map((profile) => profile.providerKey)
          .sort(),
        liveBetaReadySources: this.sourceReadinessProfiles
          .filter((profile) => profile.runtimeReadiness === 'live_beta_ready')
          .map((profile) => profile.providerKey)
          .sort(),
        deferredSources: this.sourceReadinessProfiles
          .filter((profile) => profile.state !== 'enabled_beta')
          .map((profile) => profile.providerKey)
          .sort(),
      },
      checks: [
        {
          name: 'api_gateway',
          status: 'ok',
          detail: 'Nest application initialized.',
        },
        {
          name: 'source_capability_profiles',
          status: 'ok',
          detail: 'Source readiness profiles loaded.',
        },
        {
          name: 'operator_contract',
          status: 'ok',
          detail: 'Readiness metadata is available without database or provider network calls.',
        },
      ],
    };
  }

  private ok(): HealthResponse {
    return {
      status: 'ok',
      service: 'api-gateway',
      checkedAt: this.clock.now().toISOString(),
      uptimeSeconds: Math.floor(this.uptimeSeconds()),
    };
  }

  private envMode(key: string, fallback: string): string {
    return this.env[key] ?? fallback;
  }

  private loopMode(key: string): string {
    return this.env[key] ?? (this.env.NODE_ENV === 'test' ? 'disabled' : 'enabled');
  }

  private summaryJobLoopMode(): string {
    return this.env.INTELLIGENCE_SUMMARY_JOB_LOOP ??
      (this.env.NODE_ENV === 'test' || this.env.INTELLIGENCE_SUMMARY_QUEUE_READER === 'rabbitmq'
        ? 'disabled'
        : 'enabled');
  }

  private summaryQueueDrainLoopMode(): string {
    return this.env.INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP ??
      (this.env.NODE_ENV !== 'test' && this.env.INTELLIGENCE_SUMMARY_QUEUE_READER === 'rabbitmq'
        ? 'enabled'
        : 'disabled');
  }

  private deliveryAttemptQueueDrainLoopMode(): string {
    return this.env.DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP ??
      (this.env.NODE_ENV !== 'test' && this.env.DELIVERY_ATTEMPT_QUEUE_READER === 'rabbitmq'
        ? 'enabled'
        : 'disabled');
  }
}
