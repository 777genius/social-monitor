import type { Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { ProjectReaderSummaryReadyEventUseCase } from '../../features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { QueueDeliveryAttemptUseCase } from '../../features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import {
  DELIVERY_ATTEMPT_REPOSITORY,
  DELIVERY_DIGEST_REPOSITORY,
  DELIVERY_DIGEST_SCHEDULE_REPOSITORY,
  DELIVERY_DIGEST_SOURCE_READER,
  DELIVERY_NOTIFICATION_PREFERENCE_MANAGER,
  DELIVERY_NOTIFICATION_PREFERENCE_READER,
  DELIVERY_REALTIME_EVENT_REPOSITORY,
  DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
  DELIVERY_WEBHOOK_REPLAY_STORE,
  DELIVERY_WEBHOOK_SECRET_VAULT,
} from './delivery-provider-tokens';
import { DeliveryRestModule } from './delivery-rest.module';

const moduleProviders = (): Provider[] =>
  Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DeliveryRestModule) as Provider[];

const providerToken = (provider: Provider): unknown =>
  typeof provider === 'function' ? provider : provider.provide;

describe('DeliveryRestModule composition contract', () => {
  it('registers each storage and application boundary exactly once', () => {
    const tokens = moduleProviders().map(providerToken);
    for (const token of [
      DELIVERY_ATTEMPT_REPOSITORY,
      DELIVERY_DIGEST_REPOSITORY,
      DELIVERY_DIGEST_SCHEDULE_REPOSITORY,
      DELIVERY_DIGEST_SOURCE_READER,
      DELIVERY_NOTIFICATION_PREFERENCE_MANAGER,
      DELIVERY_NOTIFICATION_PREFERENCE_READER,
      DELIVERY_REALTIME_EVENT_REPOSITORY,
      DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
      DELIVERY_WEBHOOK_REPLAY_STORE,
      DELIVERY_WEBHOOK_SECRET_VAULT,
      QueueDeliveryAttemptUseCase,
      ProjectReaderSummaryReadyEventUseCase,
    ]) {
      expect(tokens.filter((candidate) => candidate === token)).toHaveLength(1);
    }
  });

  it('preserves every public module export', () => {
    const tokens = new Set(moduleProviders().map(providerToken));
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      DeliveryRestModule,
    ) as unknown[];

    for (const exported of exports) {
      expect(tokens.has(exported)).toBe(true);
    }
  });
});
