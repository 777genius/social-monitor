import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

export type WorkerRuntimeOptions = {
  readonly serviceName: string;
};

@Injectable()
export class WorkerRuntime implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerRuntime.name);
  private started = false;

  constructor(private readonly options: WorkerRuntimeOptions) {}

  onModuleInit(): void {
    this.started = true;
    this.logger.log(`${this.options.serviceName} worker started`);
  }

  onApplicationShutdown(signal?: string): void {
    this.started = false;
    this.logger.log(`${this.options.serviceName} worker stopped${signal ? ` by ${signal}` : ''}`);
  }

  isStarted(): boolean {
    return this.started;
  }
}
