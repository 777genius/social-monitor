import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { SystemClock } from '@social-monitor/shared-kernel';

import { CircuitBreakerDeliveryProvider } from '../../adapters/notification/circuit-breaker-delivery.provider';
import {
  FetchWebhookHttpClient,
  type HttpWebhookDeliveryProviderOptions,
  HttpWebhookDeliveryProvider,
} from '../../adapters/notification/http-webhook-delivery.provider';
import { InMemoryDeliveryProvider } from '../../adapters/notification/in-memory-delivery.provider';
import { MeteredDeliveryProvider } from '../../adapters/notification/metered-delivery.provider';
import { SignWebhookPayloadUseCase } from '../../features/sign-webhook-payload/sign-webhook-payload.use-case';
import type { DeliveryChannel } from '../../domain';
import type {
  DeliveryProviderPort,
  WebhookEndpointRepositoryPort,
  WebhookEventCatalogPort,
  WebhookSecretVaultPort,
} from '../../ports';

export const createDeliveryProviders = (
  enabledChannels: readonly DeliveryChannel[],
  webhookProviderMode: 'in-memory' | 'http',
  webhookOptions: HttpWebhookDeliveryProviderOptions,
  metrics: MetricsRecorderPort,
  endpoints: WebhookEndpointRepositoryPort,
  secrets: WebhookSecretVaultPort,
  eventCatalog: WebhookEventCatalogPort,
): readonly DeliveryProviderPort[] => {
  const providers: DeliveryProviderPort[] = [];

  if (enabledChannels.includes('in_app')) {
    providers.push(createInMemoryDeliveryProvider('in_app', metrics));
  }
  if (enabledChannels.includes('email')) {
    providers.push(createInMemoryDeliveryProvider('email', metrics));
  }
  if (enabledChannels.includes('webhook')) {
    providers.push(createWebhookDeliveryProvider(
      webhookProviderMode,
      webhookOptions,
      metrics,
      endpoints,
      secrets,
      eventCatalog,
    ));
  }

  return providers;
};

const createInMemoryDeliveryProvider = (
  channel: DeliveryProviderPort['channel'],
  metrics: MetricsRecorderPort,
): DeliveryProviderPort =>
  wrapDeliveryProvider(new InMemoryDeliveryProvider(channel), metrics);

const createWebhookDeliveryProvider = (
  mode: 'in-memory' | 'http',
  options: HttpWebhookDeliveryProviderOptions,
  metrics: MetricsRecorderPort,
  endpoints: WebhookEndpointRepositoryPort,
  secrets: WebhookSecretVaultPort,
  eventCatalog: WebhookEventCatalogPort,
): DeliveryProviderPort => {
  const delegate = mode === 'http'
    ? new HttpWebhookDeliveryProvider(
        endpoints,
        new SignWebhookPayloadUseCase(endpoints, secrets, eventCatalog),
        new FetchWebhookHttpClient(),
        new SystemClock(),
        options,
      )
    : new InMemoryDeliveryProvider('webhook');

  return wrapDeliveryProvider(delegate, metrics);
};

const wrapDeliveryProvider = (
  provider: DeliveryProviderPort,
  metrics: MetricsRecorderPort,
): DeliveryProviderPort =>
  new MeteredDeliveryProvider(
    new CircuitBreakerDeliveryProvider(provider, new SystemClock(), {
      failureThreshold: 3,
      cooldownSeconds: 60,
    }),
    metrics,
  );
