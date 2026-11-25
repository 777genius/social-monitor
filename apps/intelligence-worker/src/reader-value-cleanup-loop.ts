import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger } from '@social-monitor/platform-logging';
import { CleanupReaderValueCacheUseCase } from '@social-monitor/relevance/application/use-cases/cleanup-reader-value-cache.use-case';
import { READER_VALUE_CLEANUP_OPTIONS, type ReaderValueCleanupOptions } from './reader-value-provider-tokens';

@Injectable()
export class ReaderValueCleanupLoop implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new NestStructuredLogger(ReaderValueCleanupLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private stopping = false;
  constructor(@Inject(CleanupReaderValueCacheUseCase) private readonly cleanup: CleanupReaderValueCacheUseCase | null,
    @Inject(READER_VALUE_CLEANUP_OPTIONS) private readonly options: ReaderValueCleanupOptions) {}

  async onModuleInit(): Promise<void> {
    if (!this.cleanup) return;
    this.logger.info('reader value cleanup policy loaded', {
      policySource: this.options.policySource, policySha256: this.options.policySha256,
      knownPolicy: this.options.policy.retentionHoldWorkspaceIds !== null,
    });
    await this.tick();
    if (!this.stopping) this.timer = setInterval(() => { void this.tick(); }, 60_000);
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.currentTick;
  }
  onApplicationShutdown(): Promise<void> { return this.onModuleDestroy(); }

  async tick(): Promise<void> {
    if (this.stopping || this.currentTick || !this.cleanup) return;
    this.currentTick = this.runCleanup().finally(() => { this.currentTick = undefined; });
    await this.currentTick;
  }
  private async runCleanup(): Promise<void> {
    const result = await this.cleanup!.execute();
    if (!result.ok) this.logger.error('reader value cleanup failed', { code: result.error });
    else this.logger.info('reader value cleanup completed', { ...result.value,
      health: this.options.policy.retentionHoldWorkspaceIds === null || result.value.deferredUnknownPolicy > 0 ? 'unknown_retention_policy'
        : result.value.deferredActiveJob > 0 ? 'deferred_active_job' : 'ok' });
  }
}
