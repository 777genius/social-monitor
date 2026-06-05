import { Test } from '@nestjs/testing';

import { DeliveryServiceModule } from '../../apps/delivery-service/src/delivery-service.module';
import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import { IntelligenceWorkerModule } from '../../apps/intelligence-worker/src/intelligence-worker.module';
import { WorkerRuntime } from '../../libs/platform/worker/src';

const workerModules = [
  ['ingestion-worker', IngestionWorkerModule],
  ['intelligence-worker', IntelligenceWorkerModule],
  ['delivery-service', DeliveryServiceModule],
] as const;

describe('worker bootstraps (e2e)', () => {
  it.each(workerModules)('%s boots and shuts down cleanly', async (_serviceName, moduleClass) => {
    const moduleRef = await Test.createTestingModule({
      imports: [moduleClass],
    }).compile();

    await moduleRef.init();

    const runtime = moduleRef.get(WorkerRuntime);
    expect(runtime.isStarted()).toBe(true);

    await moduleRef.close();
    expect(runtime.isStarted()).toBe(false);
  });
});
