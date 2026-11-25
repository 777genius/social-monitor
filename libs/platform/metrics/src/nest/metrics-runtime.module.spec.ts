import { Test } from '@nestjs/testing';

import {
  InMemoryMetricsRecorder,
  MetricsRuntime,
} from '../index';
import {
  METRICS_RECORDER,
  MetricsRuntimeModule,
} from './metrics-runtime.module';

describe('MetricsRuntimeModule', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRuntimeProfile =
    process.env.SOCIAL_MONITOR_RUNTIME_PROFILE;
  const previousMetricsMode = process.env.SOCIAL_MONITOR_METRICS_MODE;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.SOCIAL_MONITOR_RUNTIME_PROFILE = 'deterministic-test';
    delete process.env.SOCIAL_MONITOR_METRICS_MODE;
  });

  afterAll(() => {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv(
      'SOCIAL_MONITOR_RUNTIME_PROFILE',
      previousRuntimeProfile,
    );
    restoreEnv('SOCIAL_MONITOR_METRICS_MODE', previousMetricsMode);
  });

  it('provides one process-scoped recorder and shuts the runtime down with Nest', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetricsRuntimeModule.register({ serviceName: 'metrics-module-test' }),
      ],
    }).compile();

    const runtime = moduleRef.get(MetricsRuntime);
    const recorder = moduleRef.get<InMemoryMetricsRecorder>(METRICS_RECORDER);

    expect(recorder).toBeInstanceOf(InMemoryMetricsRecorder);
    expect(moduleRef.get(InMemoryMetricsRecorder)).toBe(recorder);
    expect(runtime.recorder).toBe(recorder);
    expect(runtime.health()).toMatchObject({
      serviceName: 'metrics-module-test',
      mode: 'in-memory',
      lifecycle: 'active',
      exportState: 'not_applicable',
    });

    await moduleRef.close();
    expect(runtime.health().lifecycle).toBe('stopped');
  });
});

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
};
