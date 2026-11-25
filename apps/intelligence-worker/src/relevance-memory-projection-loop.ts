import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { ProjectRelevanceMemoryBatchUseCase } from '@social-monitor/relevance/features/project-relevance-memory/project-relevance-memory-batch.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS,
  type IntelligenceRelevanceMemoryProjectionLoopOptions,
} from './intelligence-worker-provider-tokens';

@Injectable()
export class RelevanceMemoryProjectionLoop implements OnModuleInit, OnModuleDestroy {
  private readonly logger: StructuredLogger = new NestStructuredLogger(RelevanceMemoryProjectionLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly projectRelevanceMemory: ProjectRelevanceMemoryBatchUseCase,
    @Inject(INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS)
    private readonly options: IntelligenceRelevanceMemoryProjectionLoopOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('relevance memory projection loop disabled', { worker: 'intelligence-worker' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('relevance memory projection loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      scoped: this.options.tenantId !== undefined,
      worker: 'intelligence-worker',
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.shuttingDown) {
      await this.currentTick;
      return;
    }
    this.shuttingDown = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.currentTick;
    this.logger.info('relevance memory projection loop stopped', { worker: 'intelligence-worker' });
  }

  onApplicationShutdown(signal?: string): Promise<void> {
    void signal;
    return this.onModuleDestroy();
  }

  private async runTick(trigger: 'startup' | 'interval'): Promise<void> {
    if (this.shuttingDown || this.currentTick !== undefined) {
      return;
    }

    this.currentTick = this.executeTick(trigger).finally(() => {
      this.currentTick = undefined;
    });
    await this.currentTick;
  }

  private async executeTick(trigger: 'startup' | 'interval'): Promise<void> {
    try {
      const result = await this.projectRelevanceMemory.execute({
        limit: this.options.limit,
        ...(this.options.tenantId === undefined
          ? {}
          : {
              tenantId: tenantId(this.options.tenantId),
              workspaceId: workspaceId(this.options.workspaceId ?? ''),
            }),
      });

      if (!result.ok) {
        throw result.error;
      }

      this.logger.info('relevance memory projection loop tick completed', {
        trigger,
        ...result.value,
        worker: 'intelligence-worker',
      });
    } catch (error) {
      this.logger.error('relevance memory projection loop tick failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: 'intelligence-worker',
      });
    }
  }
}
