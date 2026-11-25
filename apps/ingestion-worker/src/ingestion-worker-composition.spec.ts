import type { Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';

import {
  INGESTION_CONVERSATION_PROJECTION,
  INGESTION_FEED_PROJECTION,
  INGESTION_SCAN_ATTEMPT_REPOSITORY,
  INGESTION_SCAN_CURSOR_REPOSITORY,
  INGESTION_SCAN_EXECUTION_REPORTER,
  INGESTION_SCAN_FAILURE_QUEUE,
  INGESTION_SCAN_LEASE,
  INGESTION_SOURCE_CANDIDATE_MEMORY,
  INGESTION_SOURCE_ENGAGEMENT_PROJECTION,
  INGESTION_SOURCE_ITEM_REPOSITORY,
  INGESTION_WORKER_PERSISTENCE_MODE,
  INGESTION_WORKER_PRISMA_CLIENT,
} from './ingestion-worker-provider-tokens';
import { IngestionWorkerModule } from './ingestion-worker.module';

const providers = (): Provider[] =>
  Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IngestionWorkerModule) as Provider[];

const providerToken = (provider: Provider): unknown =>
  typeof provider === 'function' ? provider : provider.provide;

describe('IngestionWorkerModule composition contract', () => {
  it('registers each persistence and runtime contract once', () => {
    const tokens = providers().map(providerToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of [
      INGESTION_CONVERSATION_PROJECTION,
      INGESTION_FEED_PROJECTION,
      INGESTION_SCAN_ATTEMPT_REPOSITORY,
      INGESTION_SCAN_CURSOR_REPOSITORY,
      INGESTION_SCAN_EXECUTION_REPORTER,
      INGESTION_SCAN_FAILURE_QUEUE,
      INGESTION_SCAN_LEASE,
      INGESTION_SOURCE_CANDIDATE_MEMORY,
      INGESTION_SOURCE_ENGAGEMENT_PROJECTION,
      INGESTION_SOURCE_ITEM_REPOSITORY,
      INGESTION_WORKER_PERSISTENCE_MODE,
      INGESTION_WORKER_PRISMA_CLIENT,
    ]) {
      expect(tokens.filter((candidate) => candidate === token)).toHaveLength(1);
    }
  });

  it('preserves the public worker exports', () => {
    const tokens = new Set(providers().map(providerToken));
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      IngestionWorkerModule,
    ) as unknown[];
    for (const exported of exports) {
      expect(tokens.has(exported)).toBe(true);
    }
  });
});
