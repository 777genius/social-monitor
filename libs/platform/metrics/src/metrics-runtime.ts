import type { MetricsRecorderPort } from './metrics-recorder';
import type { MetricsRuntimeMode } from './metrics-runtime-config';

export type MetricsExportState =
  | 'not_applicable'
  | 'pending'
  | 'succeeded'
  | 'failed';

export type MetricsRuntimeHealth = {
  readonly serviceName: string;
  readonly mode: MetricsRuntimeMode;
  readonly lifecycle: 'active' | 'stopped';
  readonly exportState: MetricsExportState;
  readonly lastExportAt: string | undefined;
};

export type MetricsRuntimeOptions = {
  readonly serviceName: string;
  readonly mode: MetricsRuntimeMode;
  readonly recorder: MetricsRecorderPort;
  readonly exportHealth: () => Pick<
    MetricsRuntimeHealth,
    'exportState' | 'lastExportAt'
  >;
  readonly forceFlush: () => Promise<void>;
  readonly shutdown: () => Promise<void>;
};

export class MetricsRuntime {
  readonly recorder: MetricsRecorderPort;
  private lifecycle: MetricsRuntimeHealth['lifecycle'] = 'active';
  private shutdownPromise: Promise<void> | undefined;

  constructor(private readonly options: MetricsRuntimeOptions) {
    this.recorder = options.recorder;
  }

  health(): MetricsRuntimeHealth {
    return {
      serviceName: this.options.serviceName,
      mode: this.options.mode,
      lifecycle: this.lifecycle,
      ...this.options.exportHealth(),
    };
  }

  async forceFlush(): Promise<void> {
    if (this.lifecycle === 'active') {
      await this.options.forceFlush();
    }
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownOnce();
    return this.shutdownPromise;
  }

  private async shutdownOnce(): Promise<void> {
    if (this.lifecycle === 'stopped') {
      return;
    }
    await this.options.shutdown();
    this.lifecycle = 'stopped';
  }
}
