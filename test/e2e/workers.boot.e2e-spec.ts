import { Test, type TestingModule } from '@nestjs/testing';
import amqp from 'amqplib';

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
  it('rejects colliding intelligence queues during composition before contacting RabbitMQ', async () => {
    const values = {
      INTELLIGENCE_SUMMARY_QUEUE_READER: 'rabbitmq',
      RABBITMQ_URL: 'amqp://127.0.0.1:1',
      RABBITMQ_SUMMARY_QUEUE: 'fixture-shared-summary-queue',
      RABBITMQ_READER_SUMMARY_QUEUE: ' fixture-shared-summary-queue ',
    };
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    const connect = jest.spyOn(amqp, 'connect').mockRejectedValue(new Error('Fixture forbids broker access'));
    let moduleRef: TestingModule | undefined;
    try {
      Object.assign(process.env, values);
      const compile = async () => {
        moduleRef = await Test.createTestingModule({ imports: [IntelligenceWorkerModule] }).compile();
        return moduleRef;
      };
      await expect(compile()).rejects.toThrow('must resolve to different queues');
      expect(connect).not.toHaveBeenCalled();
    } finally {
      try {
        await moduleRef?.close();
      } finally {
        connect.mockRestore();
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

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
