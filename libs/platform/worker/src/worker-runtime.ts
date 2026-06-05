import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';

export type WorkerRuntimeOptions = {
  readonly serviceName: string;
};

@Injectable()
export class WorkerRuntime implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger;
  private started = false;

  constructor(private readonly options: WorkerRuntimeOptions) {
    this.logger = new NestStructuredLogger(WorkerRuntime.name);
  }

  onModuleInit(): void {
    this.started = true;
    this.logger.info('worker started', { service: this.options.serviceName });
  }

  onApplicationShutdown(signal?: string): void {
    this.started = false;
    this.logger.info('worker stopped', { service: this.options.serviceName, signal });
  }

  isStarted(): boolean {
    return this.started;
  }
}
