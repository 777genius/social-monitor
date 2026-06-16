import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { sourceReadinessProfiles } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';

type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'api-gateway';
  readonly checkedAt: string;
  readonly uptimeSeconds: number;
};

type ReadinessResponse = HealthResponse & {
  readonly runtime: {
    readonly nodeEnv: string;
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
    };
  };
  readonly capabilities: {
    readonly rest: 'enabled';
    readonly websocket: 'enabled';
    readonly openapi: 'enabled';
    readonly workerApps: readonly string[];
    readonly enabledBetaSources: readonly string[];
    readonly deferredSources: readonly string[];
  };
  readonly checks: readonly {
    readonly name: string;
    readonly status: 'ok';
    readonly detail: string;
  }[];
};

@ApiTags('health')
@Controller()
export class HealthController {
  @Get(['health', 'healthz'])
  @ApiOperation({ summary: 'Liveness probe for the API gateway.' })
  health(): HealthResponse {
    return this.ok();
  }

  @Get(['ready', 'health/ready'])
  @ApiOperation({ summary: 'Readiness probe for the API gateway.' })
  ready(): ReadinessResponse {
    return {
      ...this.ok(),
      runtime: {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        persistence: {
          monitoring: envMode('MONITORING_PERSISTENCE', 'in-memory'),
          feed: envMode('FEED_PERSISTENCE', 'in-memory'),
          ingestionSupport: envMode('INGESTION_SUPPORT_PERSISTENCE', 'in-memory'),
          summary: envMode('SUMMARY_PERSISTENCE', 'in-memory'),
          delivery: envMode('DELIVERY_PERSISTENCE', 'in-memory'),
          identity: envMode('IDENTITY_PERSISTENCE', 'in-memory'),
          usage: envMode('USAGE_PERSISTENCE', 'in-memory'),
        },
        workerLoops: {
          ingestionScanScheduler: loopMode('INGESTION_SCAN_SCHEDULER_LOOP'),
          ingestionScanQueueDrain: loopMode('INGESTION_SCAN_QUEUE_DRAIN_LOOP'),
          intelligenceSummaryJob: summaryJobLoopMode(),
          intelligenceSummaryQueueDrain: summaryQueueDrainLoopMode(),
          deliveryDigestScheduler: loopMode('DELIVERY_DIGEST_SCHEDULER_LOOP'),
          deliveryAttemptDispatch: loopMode('DELIVERY_ATTEMPT_DISPATCH_LOOP'),
          deliveryAttemptQueueDrain: deliveryAttemptQueueDrainLoopMode(),
          eventRelay: loopMode('EVENT_RELAY_LOOP'),
        },
        queues: {
          monitoringScanPublisher: envMode('MONITORING_SCAN_QUEUE', 'in-memory'),
          ingestionScanReader: envMode('INGESTION_SCAN_QUEUE_READER', 'in-memory'),
          summaryJobPublisher: envMode('SUMMARY_JOB_QUEUE_MODE', 'in-memory'),
          intelligenceSummaryReader: envMode('INTELLIGENCE_SUMMARY_QUEUE_READER', 'in-memory'),
          deliveryAttemptPublisher: envMode('DELIVERY_ATTEMPT_DISPATCH_QUEUE', 'in-memory'),
          deliveryAttemptReader: envMode('DELIVERY_ATTEMPT_QUEUE_READER', 'in-memory'),
        },
        providers: {
          deliveryWebhook: envMode('DELIVERY_WEBHOOK_PROVIDER', 'in-memory'),
        },
      },
      capabilities: {
        rest: 'enabled',
        websocket: 'enabled',
        openapi: 'enabled',
        workerApps: ['ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'],
        enabledBetaSources: sourceReadinessProfiles
          .filter((profile) => profile.state === 'enabled_beta')
          .map((profile) => profile.providerKey)
          .sort(),
        deferredSources: sourceReadinessProfiles
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
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}

const envMode = (key: string, fallback: string): string => process.env[key] ?? fallback;

const loopMode = (key: string): string =>
  process.env[key] ?? (process.env.NODE_ENV === 'test' ? 'disabled' : 'enabled');

const summaryJobLoopMode = (): string =>
  process.env.INTELLIGENCE_SUMMARY_JOB_LOOP ??
  (process.env.NODE_ENV === 'test' || process.env.INTELLIGENCE_SUMMARY_QUEUE_READER === 'rabbitmq'
    ? 'disabled'
    : 'enabled');

const summaryQueueDrainLoopMode = (): string =>
  process.env.INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP ??
  (process.env.NODE_ENV !== 'test' && process.env.INTELLIGENCE_SUMMARY_QUEUE_READER === 'rabbitmq'
    ? 'enabled'
    : 'disabled');

const deliveryAttemptQueueDrainLoopMode = (): string =>
  process.env.DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP ??
  (process.env.NODE_ENV !== 'test' && process.env.DELIVERY_ATTEMPT_QUEUE_READER === 'rabbitmq'
    ? 'enabled'
    : 'disabled');
