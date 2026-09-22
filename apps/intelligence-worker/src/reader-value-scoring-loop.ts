import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger } from '@social-monitor/platform-logging';
import { RunReaderValueTickUseCase } from '@social-monitor/relevance/application/use-cases/run-reader-value-tick.use-case';

@Injectable()
export class ReaderValueScoringLoop implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new NestStructuredLogger(ReaderValueScoringLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private current: Promise<void> | undefined;
  private stopping = false;
  constructor(@Inject(RunReaderValueTickUseCase) private readonly run: RunReaderValueTickUseCase | null) {}
  async onModuleInit(): Promise<void> {
    if (!this.run) return;
    await this.tick();
    if (!this.stopping) this.timer = setInterval(() => { void this.tick(); }, 10_000);
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.current;
  }
  onApplicationShutdown(): Promise<void> { return this.onModuleDestroy(); }
  async tick(): Promise<void> {
    if (!this.run || this.current || this.stopping) return;
    this.current = this.run.execute().then((result) => {
      const fields = { ...result, fatalFailureCode: result.fatalFailureCode ?? undefined, restartRequired: result.health === 'provider_paused' };
      if (result.health === 'ok') this.logger.info('reader value scoring tick', fields);
      else this.logger.error('reader value scoring health', fields);
    }).finally(() => { this.current = undefined; });
    await this.current;
  }
}
