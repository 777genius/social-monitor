import {
  Global,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SystemClock } from '@social-monitor/shared-kernel';

import { createOpenTelemetryMetricsRuntime } from '../adapters/opentelemetry-metrics-runtime';
import {
  InMemoryMetricsRecorder,
  type MetricsRecorderPort,
} from '../metrics-recorder';
import { MetricsRuntime } from '../metrics-runtime';
import { resolveMetricsRuntimeConfig } from '../metrics-runtime-config';

export const METRICS_RECORDER = Symbol('METRICS_RECORDER');

export type MetricsRuntimeModuleOptions = {
  readonly serviceName: string;
};

@Global()
@Module({})
export class MetricsRuntimeModule {
  static register(options: MetricsRuntimeModuleOptions): DynamicModule {
    return {
      global: true,
      module: MetricsRuntimeModule,
      providers: [
        {
          provide: MetricsRuntime,
          useFactory: (): MetricsRuntime => {
            const config = resolveMetricsRuntimeConfig(
              process.env,
              options.serviceName,
            );
            if (config.mode === 'otlp') {
              return createOpenTelemetryMetricsRuntime(
                config,
                new SystemClock(),
              );
            }
            return createInMemoryMetricsRuntime(config.serviceName);
          },
        },
        {
          provide: METRICS_RECORDER,
          useFactory: (runtime: MetricsRuntime): MetricsRecorderPort =>
            runtime.recorder,
          inject: [MetricsRuntime],
        },
        {
          provide: InMemoryMetricsRecorder,
          useExisting: METRICS_RECORDER,
        },
        MetricsRuntimeLifecycle,
      ],
      exports: [
        MetricsRuntime,
        METRICS_RECORDER,
        InMemoryMetricsRecorder,
      ],
    };
  }
}

@Injectable()
class MetricsRuntimeLifecycle implements OnApplicationShutdown {
  constructor(private readonly runtime: MetricsRuntime) {}

  onApplicationShutdown(): Promise<void> {
    return this.runtime.shutdown();
  }
}

const createInMemoryMetricsRuntime = (serviceName: string): MetricsRuntime =>
  new MetricsRuntime({
    serviceName,
    mode: 'in-memory',
    recorder: new InMemoryMetricsRecorder(),
    exportHealth: () => ({
      exportState: 'not_applicable',
      lastExportAt: undefined,
    }),
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  });
