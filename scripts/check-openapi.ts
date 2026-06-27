import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";
import { DeliveryAttemptsController } from "@social-monitor/delivery/interfaces/rest/delivery-attempts.controller";
import { DeliveryReadAuthorizer } from "@social-monitor/delivery/interfaces/rest/delivery-read.authorizer";
import { DigestSchedulesController } from "@social-monitor/delivery/interfaces/rest/digest-schedules.controller";
import { DigestsController } from "@social-monitor/delivery/interfaces/rest/digests.controller";
import { NotificationPreferencesController } from "@social-monitor/delivery/interfaces/rest/notification-preferences.controller";
import { RealtimeEventsController } from "@social-monitor/delivery/interfaces/rest/realtime-events.controller";
import { WebhookEndpointsController } from "@social-monitor/delivery/interfaces/rest/webhook-endpoints.controller";
import { CreateDigestScheduleUseCase } from "@social-monitor/delivery/features/create-digest-schedule/create-digest-schedule.use-case";
import { CreateWebhookEndpointUseCase } from "@social-monitor/delivery/features/create-webhook-endpoint/create-webhook-endpoint.use-case";
import { DisableWebhookEndpointUseCase } from "@social-monitor/delivery/features/disable-webhook-endpoint/disable-webhook-endpoint.use-case";
import { GetDeliveryAttemptUseCase } from "@social-monitor/delivery/features/get-delivery-attempt/get-delivery-attempt.use-case";
import { GetDigestScheduleUseCase } from "@social-monitor/delivery/features/get-digest-schedule/get-digest-schedule.use-case";
import { GetDigestUseCase } from "@social-monitor/delivery/features/get-digest/get-digest.use-case";
import { GetNotificationPreferenceUseCase } from "@social-monitor/delivery/features/get-notification-preference/get-notification-preference.use-case";
import { GetWebhookEndpointUseCase } from "@social-monitor/delivery/features/get-webhook-endpoint/get-webhook-endpoint.use-case";
import { ListDeliveryAttemptsUseCase } from "@social-monitor/delivery/features/list-delivery-attempts/list-delivery-attempts.use-case";
import { ListDigestSchedulesUseCase } from "@social-monitor/delivery/features/list-digest-schedules/list-digest-schedules.use-case";
import { ListRealtimeEventsUseCase } from "@social-monitor/delivery/features/list-realtime-events/list-realtime-events.use-case";
import { ListWebhookEndpointsUseCase } from "@social-monitor/delivery/features/list-webhook-endpoints/list-webhook-endpoints.use-case";
import { RetryDeliveryAttemptUseCase } from "@social-monitor/delivery/features/retry-delivery-attempt/retry-delivery-attempt.use-case";
import { SetNotificationPreferenceUseCase } from "@social-monitor/delivery/features/set-notification-preference/set-notification-preference.use-case";
import { FeedController } from "@social-monitor/feed/interfaces/rest/feed.controller";
import { GetFeedItemUseCase } from "@social-monitor/feed/features/get-feed-item/get-feed-item.use-case";
import { ListFeedItemsUseCase } from "@social-monitor/feed/features/list-feed-items/list-feed-items.use-case";
import { ApiKeyRequestAuthorizer } from "@social-monitor/identity/interfaces/rest/api-key-request-authorizer";
import { UserWorkspaceRequestAuthorizer } from "@social-monitor/identity/interfaces/authorization/user-workspace-request.authorizer";
import { WorkspaceRoleHeaderParser } from "@social-monitor/identity/interfaces/authorization/workspace-role-header.parser";
import { ApiKeysController } from "@social-monitor/identity/interfaces/rest/api-keys.controller";
import { CreateApiKeyUseCase } from "@social-monitor/identity/features/create-api-key/create-api-key.use-case";
import { ListApiKeysUseCase } from "@social-monitor/identity/features/list-api-keys/list-api-keys.use-case";
import { RevokeApiKeyUseCase } from "@social-monitor/identity/features/revoke-api-key/revoke-api-key.use-case";
import { WORKSPACE_AUTHORIZATION_POLICY } from "@social-monitor/identity/ports";
import { ScanDeadLetterController } from "@social-monitor/ingestion/interfaces/rest/scan-dead-letter.controller";
import { SourceProfileController } from "@social-monitor/ingestion/interfaces/rest/source-profile.controller";
import { ListScanDeadLettersUseCase } from "@social-monitor/ingestion/features/list-scan-dead-letters/list-scan-dead-letters.use-case";
import { ListSourceProfilesUseCase } from "@social-monitor/ingestion/features/list-source-profiles/list-source-profiles.use-case";
import { GetBetaLaunchSupportUseCase } from "@social-monitor/launch/features/get-beta-launch-support/get-beta-launch-support.use-case";
import { BetaLaunchSupportController } from "@social-monitor/launch/interfaces/rest/beta-launch-support.controller";
import { ArchiveTopicUseCase } from "@social-monitor/monitoring/features/archive-topic/archive-topic.use-case";
import { BindSourceUseCase } from "@social-monitor/monitoring/features/bind-source/bind-source.use-case";
import { ChangeSourceBindingStatusUseCase } from "@social-monitor/monitoring/features/change-source-binding-status/change-source-binding-status.use-case";
import { CreateSourceCredentialUseCase } from "@social-monitor/monitoring/features/create-source-credential/create-source-credential.use-case";
import { CreateTopicUseCase } from "@social-monitor/monitoring/features/create-topic/create-topic.use-case";
import { GetScanPolicyUseCase } from "@social-monitor/monitoring/features/get-scan-policy/get-scan-policy.use-case";
import { GetScanStatusUseCase } from "@social-monitor/monitoring/features/get-scan-status/get-scan-status.use-case";
import { GetSourceBindingHealthUseCase } from "@social-monitor/monitoring/features/get-source-binding-health/get-source-binding-health.use-case";
import { ListSourceCredentialsUseCase } from "@social-monitor/monitoring/features/list-source-credentials/list-source-credentials.use-case";
import { ListSourceBindingDailyHistoryUseCase } from "@social-monitor/monitoring/features/list-source-binding-daily-history/list-source-binding-daily-history.use-case";
import { ListSourceBindingOverviewUseCase } from "@social-monitor/monitoring/features/list-source-binding-overview/list-source-binding-overview.use-case";
import { ListSourceBindingScansUseCase } from "@social-monitor/monitoring/features/list-source-binding-scans/list-source-binding-scans.use-case";
import { ListSourceBindingsUseCase } from "@social-monitor/monitoring/features/list-source-bindings/list-source-bindings.use-case";
import { ListTopicSourceDailyHistoryUseCase } from "@social-monitor/monitoring/features/list-topic-source-daily-history/list-topic-source-daily-history.use-case";
import { ListTopicsUseCase } from "@social-monitor/monitoring/features/list-topics/list-topics.use-case";
import { RequestScanUseCase } from "@social-monitor/monitoring/features/request-scan/request-scan.use-case";
import { RevokeSourceCredentialUseCase } from "@social-monitor/monitoring/features/revoke-source-credential/revoke-source-credential.use-case";
import { RotateSourceCredentialUseCase } from "@social-monitor/monitoring/features/rotate-source-credential/rotate-source-credential.use-case";
import { SetScanPolicyUseCase } from "@social-monitor/monitoring/features/set-scan-policy/set-scan-policy.use-case";
import { UpdateTopicUseCase } from "@social-monitor/monitoring/features/update-topic/update-topic.use-case";
import { ScanPolicyController } from "@social-monitor/monitoring/interfaces/rest/scan-policy.controller";
import { ScanRequestController } from "@social-monitor/monitoring/interfaces/rest/scan-request.controller";
import { ScanStatusController } from "@social-monitor/monitoring/interfaces/rest/scan-status.controller";
import { SourceBindingController } from "@social-monitor/monitoring/interfaces/rest/source-binding.controller";
import { SourceCredentialController } from "@social-monitor/monitoring/interfaces/rest/source-credential.controller";
import { TopicController } from "@social-monitor/monitoring/interfaces/rest/topic.controller";
import { BuildPersonalizedDigestUseCase } from "@social-monitor/relevance/features/build-personalized-digest/build-personalized-digest.use-case";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RecordRelevanceFeedbackUseCase } from "@social-monitor/relevance/features/record-relevance-feedback/record-relevance-feedback.use-case";
import { UpsertUserRelevanceProfileUseCase } from "@social-monitor/relevance/features/upsert-user-relevance-profile/upsert-user-relevance-profile.use-case";
import { RelevanceController } from "@social-monitor/relevance/interfaces/rest/relevance.controller";
import { GetSummaryJobStatusUseCase } from "@social-monitor/summary/features/get-summary-job-status/get-summary-job-status.use-case";
import { GetSummaryPolicyUseCase } from "@social-monitor/summary/features/get-summary-policy/get-summary-policy.use-case";
import { GetSummaryUseCase } from "@social-monitor/summary/features/get-summary/get-summary.use-case";
import { GetReaderSummaryJobStatusUseCase } from "@social-monitor/summary/features/get-reader-summary-job-status/get-reader-summary-job-status.use-case";
import { GetReaderSummaryUseCase } from "@social-monitor/summary/features/get-reader-summary/get-reader-summary.use-case";
import { ListSummariesUseCase } from "@social-monitor/summary/features/list-summaries/list-summaries.use-case";
import { ListSummaryFeedbackUseCase } from "@social-monitor/summary/features/list-summary-feedback/list-summary-feedback.use-case";
import { ListReaderSummariesUseCase } from "@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case";
import { RecordSummaryFeedbackUseCase } from "@social-monitor/summary/features/record-summary-feedback/record-summary-feedback.use-case";
import { RegenerateSummaryUseCase } from "@social-monitor/summary/features/regenerate-summary/regenerate-summary.use-case";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { RequestSummaryUseCase } from "@social-monitor/summary/features/request-summary/request-summary.use-case";
import { UpsertSummaryPolicyUseCase } from "@social-monitor/summary/features/upsert-summary-policy/upsert-summary-policy.use-case";
import { ReaderSummaryController } from "@social-monitor/summary/interfaces/rest/reader-summary.controller";
import { ReaderSummaryJobController } from "@social-monitor/summary/interfaces/rest/reader-summary-job.controller";
import { ReaderSummaryRequestController } from "@social-monitor/summary/interfaces/rest/reader-summary-request.controller";
import { SummaryFeedbackController } from "@social-monitor/summary/interfaces/rest/summary-feedback.controller";
import { SummaryJobController } from "@social-monitor/summary/interfaces/rest/summary-job.controller";
import { SummaryPolicyController } from "@social-monitor/summary/interfaces/rest/summary-policy.controller";
import { SummaryRequestController } from "@social-monitor/summary/interfaces/rest/summary-request.controller";
import { SummaryController } from "@social-monitor/summary/interfaces/rest/summary.controller";
import { CreateUserSubscriptionUseCase } from "@social-monitor/subscriptions/features/create-user-subscription/create-user-subscription.use-case";
import { ActivateTopicSourceUseCase } from "@social-monitor/subscriptions/features/activate-topic-source/activate-topic-source.use-case";
import { GetEffectiveUserSummaryPreferenceUseCase } from "@social-monitor/subscriptions/features/get-effective-user-summary-preference/get-effective-user-summary-preference.use-case";
import { ListUserSubscriptionsUseCase } from "@social-monitor/subscriptions/features/list-user-subscriptions/list-user-subscriptions.use-case";
import { UpsertUserSummaryPreferenceUseCase } from "@social-monitor/subscriptions/features/upsert-user-summary-preference/upsert-user-summary-preference.use-case";
import { UserSubscriptionsController } from "@social-monitor/subscriptions/interfaces/rest/user-subscriptions.controller";
import { UserSummaryPreferencesController } from "@social-monitor/subscriptions/interfaces/rest/user-summary-preferences.controller";
import { ListPublicApiAuditEventsUseCase } from "@social-monitor/usage/features/list-public-api-audit-events/list-public-api-audit-events.use-case";
import { RecordPublicApiAuditEventUseCase } from "@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case";
import { PublicApiAuditEventsController } from "@social-monitor/usage/interfaces/rest/public-api-audit-events.controller";
import { RequestCorrelationIdFactory } from "@social-monitor/platform-request-context";
import "reflect-metadata";

import { HealthController } from "../apps/api-gateway/src/health.controller";
import { ApiGatewayHealthReporter } from "../apps/api-gateway/src/health-reporter";

const snapshotPath = "libs/contracts/rest/openapi.snapshot.json";
const shouldUpdate =
  process.argv.includes("--update") ||
  process.env.UPDATE_OPENAPI_SNAPSHOT === "1";

process.env.SOURCE_CONFIG_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString(
  "base64url",
);
process.env.DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY ??= Buffer.alloc(
  32,
  8,
).toString("base64url");

const noopUseCase = {
  execute: async () => ({ ok: true, value: {} }),
};

const noopApiKeyAuthorizer = {
  authorize: async () => ({ apiKeyId: "contract-check-api-key" }),
  authorizeUser: async () => ({
    actorType: "user",
    actorId: "contract-check-user",
    userId: "contract-check-user",
  }),
};

const noopUserWorkspaceRequestAuthorizer = {
  authorize: async () => ({
    actorType: "user",
    actorId: "contract-check-user",
    userId: "contract-check-user",
  }),
};

const noopWorkspaceAuthorization = {
  authorize: () => ({ ok: true, value: undefined }),
};

const noopWorkspaceRoleHeaderParser = {
  parse: () => [],
};

const noopRequestCorrelationIds = {
  fromRequestId: (requestId: string | undefined) =>
    requestId ?? "contract-check-correlation-id",
};

const noopHealthReporter = {
  health: () => ({
    status: "ok",
    service: "api-gateway",
    checkedAt: "2026-01-02T03:04:05.000Z",
    uptimeSeconds: 1,
  }),
  ready: () => ({
    status: "ok",
    service: "api-gateway",
    checkedAt: "2026-01-02T03:04:05.000Z",
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
  CreateSourceCredentialUseCase,
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
  GetReaderSummaryJobStatusUseCase,
  GetReaderSummaryUseCase,
  GetWebhookEndpointUseCase,
  GetBetaLaunchSupportUseCase,
  ListApiKeysUseCase,
  ListDeliveryAttemptsUseCase,
  ListDigestSchedulesUseCase,
  ListFeedItemsUseCase,
  ListPublicApiAuditEventsUseCase,
  ListRealtimeEventsUseCase,
  ListScanDeadLettersUseCase,
  ListSourceCredentialsUseCase,
  ListSourceBindingsUseCase,
  ListSourceBindingDailyHistoryUseCase,
  ListSourceBindingOverviewUseCase,
  ListSourceBindingScansUseCase,
  ListTopicSourceDailyHistoryUseCase,
  ListSourceProfilesUseCase,
  ListSummariesUseCase,
  ListSummaryFeedbackUseCase,
  ListReaderSummariesUseCase,
  ListTopicsUseCase,
  ListWebhookEndpointsUseCase,
  BuildPersonalizedDigestUseCase,
  ActivateTopicSourceUseCase,
  ArchiveTopicUseCase,
  CreateUserSubscriptionUseCase,
  GetEffectiveUserSummaryPreferenceUseCase,
  RankFeedItemsUseCase,
  RecordRelevanceFeedbackUseCase,
  RecordPublicApiAuditEventUseCase,
  RecordSummaryFeedbackUseCase,
  RegenerateSummaryUseCase,
  RequestScanUseCase,
  RequestReaderSummaryUseCase,
  RequestSummaryUseCase,
  RetryDeliveryAttemptUseCase,
  RevokeSourceCredentialUseCase,
  RevokeApiKeyUseCase,
  RotateSourceCredentialUseCase,
  SetNotificationPreferenceUseCase,
  SetScanPolicyUseCase,
  ListUserSubscriptionsUseCase,
  UpsertUserRelevanceProfileUseCase,
  UpsertSummaryPolicyUseCase,
  UpdateTopicUseCase,
  UpsertUserSummaryPreferenceUseCase,
].map((provider) => ({
  provide: provider,
  useValue: noopUseCase,
}));

@Module({
  controllers: [
    HealthController,
    TopicController,
    SourceBindingController,
    SourceCredentialController,
    ScanRequestController,
    ScanPolicyController,
    ScanStatusController,
    FeedController,
    SourceProfileController,
    ScanDeadLetterController,
    BetaLaunchSupportController,
    RelevanceController,
    SummaryController,
    ReaderSummaryController,
    ReaderSummaryJobController,
    ReaderSummaryRequestController,
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
    UserSubscriptionsController,
    UserSummaryPreferencesController,
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
  assertFrontendReadyRequestSchemas(current);
  const serialized = `${JSON.stringify(sortJson(current), null, 2)}\n`;

  if (shouldUpdate) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, serialized);
    console.log(`OpenAPI snapshot updated: ${snapshotPath}`);
    return;
  }

  let expected: string;
  try {
    expected = readFileSync(snapshotPath, "utf8");
  } catch {
    console.error(
      `OpenAPI snapshot missing: ${snapshotPath}. Run "npm run update:openapi".`,
    );
    process.exitCode = 1;
    return;
  }

  if (expected !== serialized) {
    console.error(
      [
        "OpenAPI snapshot drift detected.",
        `Snapshot: ${relative(process.cwd(), snapshotPath)}`,
        'Run "npm run update:openapi" intentionally, review the diff and update generated clients/contracts.',
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log("OpenAPI snapshot OK");
}

async function generateOpenApiSnapshot(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(OpenApiContractModule, {
    logger: false,
  });
  try {
    await app.init();

    const swaggerConfig = new DocumentBuilder()
      .setTitle("Social Monitor API")
      .setDescription("Backend/API-first social monitoring MVP.")
      .setVersion("0.1.0")
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

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }

  return value;
}

function assertFrontendReadyRequestSchemas(document: OpenAPIObject): void {
  assertSchemaHasProperties(document, "CreateUserSubscriptionRequestDto", [
    "userId",
    "providerKey",
    "targetKind",
    "targetValue",
    "targetConfig",
    "schedule",
    "summaryPreference",
  ]);
  assertSchemaHasProperties(document, "ActivateTopicSourceRequestDto", [
    "userId",
    "providerKey",
    "targetKind",
    "targetValue",
    "targetConfig",
    "schedule",
    "summaryPreference",
    "scanPolicy",
  ]);
  assertSchemaHasProperties(document, "UserSubscriptionScheduleRequestDto", [
    "recipientKey",
    "channel",
    "intervalSeconds",
    "includeNoSignal",
    "nextRunAt",
  ]);
  assertSchemaHasProperties(document, "ActivateTopicSourceScanPolicyRequestDto", [
    "intervalSeconds",
    "freshnessSeconds",
    "retryBudget",
  ]);
  assertSchemaHasProperties(document, "CreateApiKeyRequestDto", [
    "name",
    "scopes",
  ]);
  assertSchemaHasProperties(document, "CreateDigestScheduleRequestDto", [
    "recipientKey",
    "channel",
    "topicIds",
    "intervalSeconds",
    "includeNoSignal",
    "nextRunAt",
  ]);
  assertSchemaHasProperties(document, "CreateSourceCredentialRequestDto", [
    "providerKey",
    "kind",
    "secret",
    "secretPreview",
    "scopes",
    "expiresAt",
  ]);
  assertSchemaHasProperties(document, "CreateWebhookEndpointRequestDto", [
    "url",
    "eventTypes",
  ]);
  assertSchemaHasProperties(document, "RetryDeliveryAttemptRequestDto", [
    "content",
  ]);
  assertSchemaHasProperties(document, "RotateSourceCredentialRequestDto", [
    "secret",
    "secretPreview",
    "scopes",
    "expiresAt",
  ]);
  assertSchemaHasProperties(document, "SetNotificationPreferenceRequestDto", [
    "recipientKey",
    "channel",
    "allowed",
    "reason",
  ]);
  assertSchemaHasProperties(document, "UpsertSummaryPolicyRequestDto", [
    "language",
    "format",
    "tone",
    "maxKeyPoints",
    "includeRisks",
    "includeSourceHighlights",
    "customInstructions",
  ]);
}

function assertSchemaHasProperties(
  document: OpenAPIObject,
  schemaName: string,
  requiredProperties: readonly string[],
): void {
  const schema = document.components?.schemas?.[schemaName];
  if (schema === undefined || !("properties" in schema) || schema.properties === undefined) {
    throw new Error(`OpenAPI schema ${schemaName} must expose frontend-ready request properties`);
  }

  const properties = schema.properties;
  const missing = requiredProperties.filter((property) => !(property in properties));
  if (missing.length > 0) {
    throw new Error(`OpenAPI schema ${schemaName} is missing properties: ${missing.join(", ")}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
