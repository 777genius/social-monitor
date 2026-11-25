import { Test } from '@nestjs/testing';
import {
  InMemoryMetricsRecorder,
  MetricsRuntime,
} from '@social-monitor/platform-metrics';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';

import { DeliveryServiceModule } from '../../delivery-service/src/delivery-service.module';
import { IngestionWorkerModule } from '../../ingestion-worker/src/ingestion-worker.module';
import { IntelligenceWorkerModule } from '../../intelligence-worker/src/intelligence-worker.module';
import { AppModule } from './app.module';

describe('production metrics composition', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRuntimeProfile =
    process.env.SOCIAL_MONITOR_RUNTIME_PROFILE;
  const previousMetricsMode = process.env.SOCIAL_MONITOR_METRICS_MODE;
  const previousSummaryModel = process.env.SUMMARY_MODEL_PROVIDER;
  const previousReaderSummaryModel =
    process.env.READER_SUMMARY_MODEL_PROVIDER;
  const previousReaderSummaryTopicLabeler =
    process.env.READER_SUMMARY_TOPIC_LABELER;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.SOCIAL_MONITOR_RUNTIME_PROFILE = 'deterministic-test';
    delete process.env.SOCIAL_MONITOR_METRICS_MODE;
    process.env.SUMMARY_MODEL_PROVIDER = 'deterministic';
    process.env.READER_SUMMARY_MODEL_PROVIDER = 'deterministic';
    process.env.READER_SUMMARY_TOPIC_LABELER = 'deterministic';
  });

  afterAll(() => {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv(
      'SOCIAL_MONITOR_RUNTIME_PROFILE',
      previousRuntimeProfile,
    );
    restoreEnv('SOCIAL_MONITOR_METRICS_MODE', previousMetricsMode);
    restoreEnv('SUMMARY_MODEL_PROVIDER', previousSummaryModel);
    restoreEnv(
      'READER_SUMMARY_MODEL_PROVIDER',
      previousReaderSummaryModel,
    );
    restoreEnv(
      'READER_SUMMARY_TOPIC_LABELER',
      previousReaderSummaryTopicLabeler,
    );
  });

  it.each([
    ['api-gateway', AppModule],
    ['ingestion-worker', IngestionWorkerModule],
    ['intelligence-worker', IntelligenceWorkerModule],
    ['delivery-service', DeliveryServiceModule],
  ] as const)(
    'wires one process-scoped recorder for %s',
    async (serviceName, rootModule) => {
      const moduleRef = await Test.createTestingModule({
        imports: [rootModule],
      }).compile();

      try {
        const runtime = moduleRef.get(MetricsRuntime);
        expect(runtime.health()).toMatchObject({
          serviceName,
          mode: 'in-memory',
          lifecycle: 'active',
        });
        expect(moduleRef.get(InMemoryMetricsRecorder)).toBe(runtime.recorder);
        if (rootModule === IngestionWorkerModule) {
          expect(
            moduleRef
              .select(IngestionWorkerModule)
              .get(InMemoryMetricsRecorder, { strict: true }),
          ).toBe(runtime.recorder);
        }
        if (rootModule === AppModule) {
          expect(
            moduleRef
              .select(SummaryRestModule)
              .get(InMemoryMetricsRecorder, { strict: true }),
          ).toBe(runtime.recorder);
        }
      } finally {
        await moduleRef.close();
      }
    },
  );
});

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
};
