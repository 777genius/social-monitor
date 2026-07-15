import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { DomainError } from '@social-monitor/shared-kernel';

export type WorkerRuntimeOptions = {
  readonly serviceName: string;
  readonly shutdownDrainTimeoutMs?: number;
};

@Injectable()
export class WorkerRuntime implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger;
  private readonly drainTimeoutMs: number;
  private started = false;
  private acceptingWork = false;
  private activeOperations = 0;
  private readonly drainWaiters = new Set<() => void>();

  constructor(private readonly options: WorkerRuntimeOptions) {
    this.logger = new NestStructuredLogger(WorkerRuntime.name);
    this.drainTimeoutMs = options.shutdownDrainTimeoutMs ?? 30_000;
  }

  onModuleInit(): void {
    this.started = true;
    this.acceptingWork = true;
    this.logger.info('worker started', { service: this.options.serviceName });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.acceptingWork = false;
    await this.waitForDrain();
    this.started = false;
    this.logger.info('worker stopped', {
      service: this.options.serviceName,
      signal,
      activeOperations: this.activeOperations,
    });
  }

  isStarted(): boolean {
    return this.started;
  }

  isAcceptingWork(): boolean {
    return this.started && this.acceptingWork;
  }

  getActiveOperations(): number {
    return this.activeOperations;
  }

  async runIfAccepting<TValue>(operation: string, work: () => Promise<TValue>): Promise<TValue> {
    if (!this.isAcceptingWork()) {
      throw new DomainError('operation.backpressure', 'Worker is draining and not accepting new work', {
        service: this.options.serviceName,
        operation,
      });
    }

    this.activeOperations += 1;

    try {
      return await work();
    } finally {
      this.activeOperations -= 1;
      this.notifyDrainWaiters();
    }
  }

  private async waitForDrain(): Promise<void> {
    if (this.activeOperations === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      const waiter = () => {
        clearTimeout(timeout);
        this.drainWaiters.delete(waiter);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.drainWaiters.delete(waiter);
        resolve();
      }, this.drainTimeoutMs);

      this.drainWaiters.add(waiter);
    });
  }

  private notifyDrainWaiters(): void {
    if (this.activeOperations !== 0) {
      return;
    }

    for (const waiter of [...this.drainWaiters]) {
      waiter();
    }
  }
}
