import type { Provider } from '@nestjs/common';
import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { METRICS_RECORDER } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { ContractWebhookEventCatalogAdapter } from '../../adapters/events/contract-webhook-event-catalog.adapter';
import {
  resolveHttpWebhookDeliveryProviderOptions,
  type HttpWebhookDeliveryProviderOptions,
} from '../../adapters/notification/http-webhook-delivery.provider';
import { CreateWebhookEndpointUseCase } from '../../features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { DisableWebhookEndpointUseCase } from '../../features/disable-webhook-endpoint/disable-webhook-endpoint.use-case';
import { GetWebhookEndpointUseCase } from '../../features/get-webhook-endpoint/get-webhook-endpoint.use-case';
import { ListWebhookEndpointsUseCase } from '../../features/list-webhook-endpoints/list-webhook-endpoints.use-case';
import { QuarantineWebhookEndpointUseCase } from '../../features/quarantine-webhook-endpoint/quarantine-webhook-endpoint.use-case';
import { SignWebhookPayloadUseCase } from '../../features/sign-webhook-payload/sign-webhook-payload.use-case';
import { VerifyWebhookSignatureUseCase } from '../../features/verify-webhook-signature/verify-webhook-signature.use-case';
import type { DeliveryChannel } from '../../domain';
import type {
  WebhookEndpointRepositoryPort,
  WebhookEventCatalogPort,
  WebhookReplayStorePort,
  WebhookSecretVaultPort,
} from '../../ports';
import { createDeliveryProviders } from './delivery-provider-factory';
import {
  DELIVERY_ENABLED_CHANNELS,
  DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
  DELIVERY_WEBHOOK_REPLAY_STORE,
  DELIVERY_WEBHOOK_SECRET_VAULT,
  resolveDeliveryWebhookProviderMode,
} from './delivery-provider-tokens';

export const DELIVERY_PROVIDERS = Symbol('DELIVERY_PROVIDERS');
const DELIVERY_HTTP_WEBHOOK_OPTIONS = Symbol('DELIVERY_HTTP_WEBHOOK_OPTIONS');
const DELIVERY_WEBHOOK_EVENT_CATALOG = Symbol('DELIVERY_WEBHOOK_EVENT_CATALOG');
const DELIVERY_WEBHOOK_PROVIDER_MODE = Symbol('DELIVERY_WEBHOOK_PROVIDER_MODE');

export const createDeliveryWebhookProviders = (
  env: NodeJS.ProcessEnv,
): Provider[] => [
  {
    provide: DELIVERY_WEBHOOK_EVENT_CATALOG,
    useClass: ContractWebhookEventCatalogAdapter,
  },
  {
    provide: DELIVERY_WEBHOOK_PROVIDER_MODE,
    useFactory: () => resolveDeliveryWebhookProviderMode(env),
  },
  {
    provide: DELIVERY_HTTP_WEBHOOK_OPTIONS,
    useFactory: () => resolveHttpWebhookDeliveryProviderOptions(env),
  },
  {
    provide: DELIVERY_PROVIDERS,
    useFactory: (
      enabledChannels: readonly DeliveryChannel[],
      webhookProviderMode: 'in-memory' | 'http',
      webhookOptions: HttpWebhookDeliveryProviderOptions,
      metrics: MetricsRecorderPort,
      endpoints: WebhookEndpointRepositoryPort,
      secrets: WebhookSecretVaultPort,
      eventCatalog: WebhookEventCatalogPort,
    ) =>
      createDeliveryProviders(
        enabledChannels,
        webhookProviderMode,
        webhookOptions,
        metrics,
        endpoints,
        secrets,
        eventCatalog,
      ),
    inject: [
      DELIVERY_ENABLED_CHANNELS,
      DELIVERY_WEBHOOK_PROVIDER_MODE,
      DELIVERY_HTTP_WEBHOOK_OPTIONS,
      METRICS_RECORDER,
      DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
      DELIVERY_WEBHOOK_SECRET_VAULT,
      DELIVERY_WEBHOOK_EVENT_CATALOG,
    ],
  },
  {
    provide: CreateWebhookEndpointUseCase,
    useFactory: (
      endpoints: WebhookEndpointRepositoryPort,
      secrets: WebhookSecretVaultPort,
      eventCatalog: WebhookEventCatalogPort,
    ) =>
      new CreateWebhookEndpointUseCase(
        endpoints,
        secrets,
        new CryptoIdGenerator(),
        new SystemClock(),
        eventCatalog,
      ),
    inject: [
      DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
      DELIVERY_WEBHOOK_SECRET_VAULT,
      DELIVERY_WEBHOOK_EVENT_CATALOG,
    ],
  },
  {
    provide: GetWebhookEndpointUseCase,
    useFactory: (endpoints: WebhookEndpointRepositoryPort) =>
      new GetWebhookEndpointUseCase(endpoints),
    inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
  },
  {
    provide: ListWebhookEndpointsUseCase,
    useFactory: (endpoints: WebhookEndpointRepositoryPort) =>
      new ListWebhookEndpointsUseCase(endpoints),
    inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
  },
  {
    provide: DisableWebhookEndpointUseCase,
    useFactory: (endpoints: WebhookEndpointRepositoryPort) =>
      new DisableWebhookEndpointUseCase(endpoints, new SystemClock()),
    inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
  },
  {
    provide: SignWebhookPayloadUseCase,
    useFactory: (
      endpoints: WebhookEndpointRepositoryPort,
      secrets: WebhookSecretVaultPort,
      eventCatalog: WebhookEventCatalogPort,
    ) => new SignWebhookPayloadUseCase(endpoints, secrets, eventCatalog),
    inject: [
      DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
      DELIVERY_WEBHOOK_SECRET_VAULT,
      DELIVERY_WEBHOOK_EVENT_CATALOG,
    ],
  },
  {
    provide: QuarantineWebhookEndpointUseCase,
    useFactory: (endpoints: WebhookEndpointRepositoryPort) =>
      new QuarantineWebhookEndpointUseCase(endpoints, new SystemClock()),
    inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
  },
  {
    provide: VerifyWebhookSignatureUseCase,
    useFactory: (
      endpoints: WebhookEndpointRepositoryPort,
      secrets: WebhookSecretVaultPort,
      replayStore: WebhookReplayStorePort,
    ) =>
      new VerifyWebhookSignatureUseCase(
        endpoints,
        secrets,
        replayStore,
        new SystemClock(),
      ),
    inject: [
      DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
      DELIVERY_WEBHOOK_SECRET_VAULT,
      DELIVERY_WEBHOOK_REPLAY_STORE,
    ],
  },
];

export const deliveryWebhookExports = [
  CreateWebhookEndpointUseCase,
  DisableWebhookEndpointUseCase,
  GetWebhookEndpointUseCase,
  ListWebhookEndpointsUseCase,
  QuarantineWebhookEndpointUseCase,
  SignWebhookPayloadUseCase,
  VerifyWebhookSignatureUseCase,
  DELIVERY_PROVIDERS,
];
