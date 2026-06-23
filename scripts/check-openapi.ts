import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { DeliveryAttemptsController } from '@social-monitor/delivery/interfaces/rest/delivery-attempts.controller';
import { DeliveryReadAuthorizer } from '@social-monitor/delivery/interfaces/rest/delivery-read.authorizer';
import { DigestSchedulesController } from '@social-monitor/delivery/interfaces/rest/digest-schedules.controller';
import { DigestsController } from '@social-monitor/delivery/interfaces/rest/digests.controller';
import { NotificationPreferencesController } from '@social-monitor/delivery/interfaces/rest/notification-preferences.controller';
import { RealtimeEventsController } from '@social-monitor/delivery/interfaces/rest/realtime-events.controller';
import { WebhookEndpointsController } from '@social-monitor/delivery/interfaces/rest/webhook-endpoints.controller';
import { CreateDigestScheduleUseCase } from '@social-monitor/delivery/features/create-digest-schedule/create-digest-schedule.use-case';
import { CreateWebhookEndpointUseCase } from '@social-monitor/delivery/features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { DisableWebhookEndpointUseCase } from '@social-monitor/delivery/features/disable-webhook-endpoint/disable-webhook-endpoint.use-case';
import { GetDeliveryAttemptUseCase } from '@social-monitor/delivery/features/get-delivery-attempt/get-delivery-attempt.use-case';
import { GetDigestScheduleUseCase } from '@social-monitor/delivery/features/get-digest-schedule/get-digest-schedule.use-case';
import { GetDigestUseCase } from '@social-monitor/delivery/features/get-digest/get-digest.use-case';
import { GetNotificationPreferenceUseCase } from '@social-monitor/delivery/features/get-notification-preference/get-notification-preference.use-case';
import { GetWebhookEndpointUseCase } from '@social-monitor/delivery/features/get-webhook-endpoint/get-webhook-endpoint.use-case';
import { ListDeliveryAttemptsUseCase } from '@social-monitor/delivery/features/list-delivery-attempts/list-delivery-attempts.use-case';
import { ListDigestSchedulesUseCase } from '@social-monitor/delivery/features/list-digest-schedules/list-digest-schedules.use-case';
import { ListRealtimeEventsUseCase } from '@social-monitor/delivery/features/list-realtime-events/list-realtime-events.use-case';
import { ListWebhookEndpointsUseCase } from '@social-monitor/delivery/features/list-webhook-endpoints/list-webhook-endpoints.use-case';
import { RetryDeliveryAttemptUseCase } from '@social-monitor/delivery/features/retry-delivery-attempt/retry-delivery-attempt.use-case';
import { SetNotificationPreferenceUseCase } from '@social-monitor/delivery/features/set-notification-preference/set-notification-preference.use-case';
import { FeedController } from '@social-monitor/feed/interfaces/rest/feed.controller';
import { GetFeedItemUseCase } from '@social-monitor/feed/features/get-feed-item/get-feed-item.use-case';
import { ListFeedItemsUseCase } from '@social-monitor/feed/features/list-feed-items/list-feed-items.use-case';
import { ApiKeyRequestAuthorizer } from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { UserWorkspaceRequestAuthorizer } from '@social-monitor/identity/interfaces/authorization/user-workspace-request.authorizer';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import { ApiKeysController } from '@social-monitor/identity/interfaces/rest/api-keys.controller';
import { CreateApiKeyUseCase } from '@social-monitor/identity/features/create-api-key/create-api-key.use-case';
import { ListApiKeysUseCase } from '@social-monitor/identity/features/list-api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '@social-monitor/identity/features/revoke-api-key/revoke-api-key.use-case';
import { WORKSPACE_AUTHORIZATION_POLICY } from '@social-monitor/identity/ports';
import { ScanDeadLetterController } from '@social-monitor/ingestion/interfaces/rest/scan-dead-letter.controller';
import { SourceProfileController } from '@social-monitor/ingestion/interfaces/rest/source-profile.controller';
import { ListScanDeadLettersUseCase } from '@social-monitor/ingestion/features/list-scan-dead-letters/list-scan-dead-letters.use-case';
import { ListSourceProfilesUseCase } from '@social-monitor/ingestion/features/list-source-profiles/list-source-profiles.use-case';
import { GetBetaLaunchSupportUseCase } from '@social-monitor/launch/features/get-beta-launch-support/get-beta-launch-support.use-case';
import { BetaLaunchSupportController } from '@social-monitor/launch/interfaces/rest/beta-launch-support.controller';
import { BindSourceUseCase } from '@social-monitor/monitoring/features/bind-source/bind-source.use-case';
import { ChangeSourceBindingStatusUseCase } from '@social-monitor/monitoring/features/change-source-binding-status/change-source-binding-status.use-case';
import { CreateTopicUseCase } from '@social-monitor/monitoring/features/create-topic/create-topic.use-case';
import { GetScanPolicyUseCase } from '@social-monitor/monitoring/features/get-scan-policy/get-scan-policy.use-case';
import { GetScanStatusUseCase } from '@social-monitor/monitoring/features/get-scan-status/get-scan-status.use-case';
import { GetSourceBindingHealthUseCase } from '@social-monitor/monitoring/features/get-source-binding-health/get-source-binding-health.use-case';
import { ListSourceBindingsUseCase } from '@social-monitor/monitoring/features/list-source-bindings/list-source-bindings.use-case';
import { ListTopicsUseCase } from '@social-monitor/monitoring/features/list-topics/list-topics.use-case';
import { RequestScanUseCase } from '@social-monitor/monitoring/features/request-scan/request-scan.use-case';
import { SetScanPolicyUseCase } from '@social-monitor/monitoring/features/set-scan-policy/set-scan-policy.use-case';
import { ScanPolicyController } from '@social-monitor/monitoring/interfaces/rest/scan-policy.controller';
import { ScanRequestController } from '@social-monitor/monitoring/interfaces/rest/scan-request.controller';
import { ScanStatusController } from '@social-monitor/monitoring/interfaces/rest/scan-status.controller';
import { SourceBindingController } from '@social-monitor/monitoring/interfaces/rest/source-binding.controller';
import { TopicController } from '@social-monitor/monitoring/interfaces/rest/topic.controller';
import { GetSummaryJobStatusUseCase } from '@social-monitor/summary/features/get-summary-job-status/get-summary-job-status.use-case';
import { GetSummaryPolicyUseCase } from '@social-monitor/summary/features/get-summary-policy/get-summary-policy.use-case';
import { GetSummaryUseCase } from '@social-monitor/summary/features/get-summary/get-summary.use-case';
import { GetBriefingJobStatusUseCase } from '@social-monitor/summary/features/get-briefing-job-status/get-briefing-job-status.use-case';
import { GetBriefingUseCase } from '@social-monitor/summary/features/get-briefing/get-briefing.use-case';
import { ListSummariesUseCase } from '@social-monitor/summary/features/list-summaries/list-summaries.use-case';
import { ListSummaryFeedbackUseCase } from '@social-monitor/summary/features/list-summary-feedback/list-summary-feedback.use-case';
import { ListBriefingsUseCase } from '@social-monitor/summary/features/list-briefings/list-briefings.use-case';
import { RecordSummaryFeedbackUseCase } from '@social-monitor/summary/features/record-summary-feedback/record-summary-feedback.use-case';
import { RegenerateSummaryUseCase } from '@social-monitor/summary/features/regenerate-summary/regenerate-summary.use-case';
import { RequestBriefingUseCase } from '@social-monitor/summary/features/request-briefing/request-briefing.use-case';
import { RequestSummaryUseCase } from '@social-monitor/summary/features/request-summary/request-summary.use-case';
import { UpsertSummaryPolicyUseCase } from '@social-monitor/summary/features/upsert-summary-policy/upsert-summary-policy.use-case';
import { BriefingController } from '@social-monitor/summary/interfaces/rest/briefing.controller';
import { BriefingJobController } from '@social-monitor/summary/interfaces/rest/briefing-job.controller';
import { BriefingRequestController } from '@social-monitor/summary/interfaces/rest/briefing-request.controller';
import { SummaryFeedbackController } from '@social-monitor/summary/interfaces/rest/summary-feedback.controller';
import { SummaryJobController } from '@social-monitor/summary/interfaces/rest/summary-job.controller';
import { SummaryPolicyController } from '@social-monitor/summary/interfaces/rest/summary-policy.controller';
import { SummaryRequestController } from '@social-monitor/summary/interfaces/rest/summary-request.controller';
import { SummaryController } from '@social-monitor/summary/interfaces/rest/summary.controller';
import { ListPublicApiAuditEventsUseCase } from '@social-monitor/usage/features/list-public-api-audit-events/list-public-api-audit-events.use-case';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import { PublicApiAuditEventsController } from '@social-monitor/usage/interfaces/rest/public-api-audit-events.controller';
import { RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
import 'reflect-metadata';

import { HealthController } from '../apps/api-gateway/src/health.controller';
import { ApiGatewayHealthReporter } from '../apps/api-gateway/src/health-reporter';

const snapshotPath = 'libs/contracts/rest/openapi.snapshot.json';
const shouldUpdate = process.argv.includes('--update') || process.env.UPDATE_OPENAPI_SNAPSHOT === '1';

process.env.SOURCE_CONFIG_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64url');
process.env.DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY ??= Buffer.alloc(32, 8).toString('base64url');

const noopUseCase = {
  execute: async () => ({ ok: true, value: {} }),
};

const noopApiKeyAuthorizer = {
  authorize: async () => ({ apiKeyId: 'contract-check-api-key' }),
  authorizeUser: async () => ({
    actorType: 'user',
    actorId: 'contract-check-user',
    userId: 'contract-check-user',
  }),
};

const noopUserWorkspaceRequestAuthorizer = {
  authorize: async () => ({
    actorType: 'user',
    actorId: 'contract-check-user',
    userId: 'contract-check-user',
  }),
};

const noopWorkspaceAuthorization = {
  authorize: () => ({ ok: true, value: undefined }),
};

const noopWorkspaceRoleHeaderParser = {
  parse: () => [],
};

const noopRequestCorrelationIds = {
  fromRequestId: (requestId: string | undefined) => requestId ?? 'contract-check-correlation-id',
};

const noopHealthReporter = {
  health: () => ({
    status: 'ok',
    service: 'api-gateway',
    checkedAt: '2026-01-02T03:04:05.000Z',
    uptimeSeconds: 1,
  }),
  ready: () => ({
    status: 'ok',
    service: 'api-gateway',
    checkedAt: '2026-01-02T03:04:05.000Z',
    uptimeSeconds: 1,
    runtime: {},
    capabilities: {},
    checks: [],
  }),
};

const noopDeliveryReadAuthorizer = {
  authorize: async () => undefined,
};

const useCaseProviders = [
  BindSourceUseCase,
  ChangeSourceBindingStatusUseCase,
  CreateApiKeyUseCase,
  CreateDigestScheduleUseCase,
  CreateTopicUseCase,
  CreateWebhookEndpointUseCase,
  DisableWebhookEndpointUseCase,
  GetDeliveryAttemptUseCase,
  GetDigestScheduleUseCase,
  GetDigestUseCase,
  GetFeedItemUseCase,
  GetNotificationPreferenceUseCase,
  GetScanPolicyUseCase,
  GetScanStatusUseCase,
  GetSourceBindingHealthUseCase,
  GetSummaryJobStatusUseCase,
  GetSummaryPolicyUseCase,
  GetSummaryUseCase,
  GetBriefingJobStatusUseCase,
  GetBriefingUseCase,
  GetWebhookEndpointUseCase,
  GetBetaLaunchSupportUseCase,
  ListApiKeysUseCase,
  ListDeliveryAttemptsUseCase,
  ListDigestSchedulesUseCase,
  ListFeedItemsUseCase,
  ListPublicApiAuditEventsUseCase,
  ListRealtimeEventsUseCase,
  ListScanDeadLettersUseCase,
  ListSourceBindingsUseCase,
  ListSourceProfilesUseCase,
  ListSummariesUseCase,
  ListSummaryFeedbackUseCase,
  ListBriefingsUseCase,
  ListTopicsUseCase,
  ListWebhookEndpointsUseCase,
  RecordPublicApiAuditEventUseCase,
  RecordSummaryFeedbackUseCase,
  RegenerateSummaryUseCase,
  RequestScanUseCase,
  RequestBriefingUseCase,
  RequestSummaryUseCase,
  RetryDeliveryAttemptUseCase,
  RevokeApiKeyUseCase,
  SetNotificationPreferenceUseCase,
  SetScanPolicyUseCase,
  UpsertSummaryPolicyUseCase,
].map((provider) => ({
  provide: provider,
  useValue: noopUseCase,
}));

@Module({
  controllers: [
    HealthController,
    TopicController,
    SourceBindingController,
    ScanRequestController,
    ScanPolicyController,
    ScanStatusController,
    FeedController,
    SourceProfileController,
    ScanDeadLetterController,
    BetaLaunchSupportController,
    SummaryController,
    BriefingController,
    BriefingJobController,
    BriefingRequestController,
    SummaryFeedbackController,
    SummaryJobController,
    SummaryPolicyController,
    SummaryRequestController,
    DeliveryAttemptsController,
    DigestSchedulesController,
    DigestsController,
    NotificationPreferencesController,
    RealtimeEventsController,
    WebhookEndpointsController,
    ApiKeysController,
    PublicApiAuditEventsController,
  ],
  providers: [
    ...useCaseProviders,
    {
      provide: ApiKeyRequestAuthorizer,
      useValue: noopApiKeyAuthorizer,
    },
    {
      provide: UserWorkspaceRequestAuthorizer,
      useValue: noopUserWorkspaceRequestAuthorizer,
    },
    {
      provide: DeliveryReadAuthorizer,
      useValue: noopDeliveryReadAuthorizer,
    },
    {
      provide: WORKSPACE_AUTHORIZATION_POLICY,
      useValue: noopWorkspaceAuthorization,
    },
    {
      provide: WorkspaceRoleHeaderParser,
      useValue: noopWorkspaceRoleHeaderParser,
    },
    {
      provide: RequestCorrelationIdFactory,
      useValue: noopRequestCorrelationIds,
    },
    {
      provide: ApiGatewayHealthReporter,
      useValue: noopHealthReporter,
    },
  ],
})
class OpenApiContractModule {}

async function main(): Promise<void> {
  const current = await generateOpenApiSnapshot();
  const serialized = `${JSON.stringify(sortJson(current), null, 2)}\n`;

  if (shouldUpdate) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, serialized);
    console.log(`OpenAPI snapshot updated: ${snapshotPath}`);
    return;
  }

  let expected: string;
  try {
    expected = readFileSync(snapshotPath, 'utf8');
  } catch {
    console.error(`OpenAPI snapshot missing: ${snapshotPath}. Run "npm run update:openapi".`);
    process.exitCode = 1;
    return;
  }

  if (expected !== serialized) {
    console.error(
      [
        'OpenAPI snapshot drift detected.',
        `Snapshot: ${relative(process.cwd(), snapshotPath)}`,
        'Run "npm run update:openapi" intentionally, review the diff and update generated clients/contracts.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('OpenAPI snapshot OK');
}

async function generateOpenApiSnapshot(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(OpenApiContractModule, { logger: false });
  try {
    await app.init();

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Social Monitor API')
      .setDescription('Backend/API-first social monitoring MVP.')
      .setVersion('0.1.0')
      .build();

    return SwaggerModule.createDocument(app, swaggerConfig);
  } finally {
    await app.close();
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }

  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
