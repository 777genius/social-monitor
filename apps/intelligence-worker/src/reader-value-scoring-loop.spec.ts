import type { RunReaderValueTickUseCase } from '@social-monitor/relevance/application/use-cases/run-reader-value-tick.use-case';
import type { CleanupReaderValueCacheUseCase } from '@social-monitor/relevance/application/use-cases/cleanup-reader-value-cache.use-case';
import { ReaderValueScoringLoop } from './reader-value-scoring-loop';
import { ReaderValueCleanupLoop } from './reader-value-cleanup-loop';
import { resolveReaderValueCleanupOptions } from './reader-value-provider-tokens';
import { NestStructuredLogger } from '@social-monitor/platform-logging';

describe('reader-value loop lifecycle', () => {
  it.each(['ok', 'provider_paused'] as const)('emits operational counters and exact fatal code for %s', async (health) => {
    const method = health === 'ok' ? 'info' : 'error';
    const log = jest.spyOn(NestStructuredLogger.prototype, method).mockImplementation(() => {});
    const result = { health, fatalFailureCode: health === 'ok' ? null : 'model_version_changed',
      assessedCacheHits: 4, unsupportedKind: 2, emptyInput: 1, unsafeSource: 1, unavailable: 1,
      assessed: 3, failed: 1, retries: 2, unknownUsage: 1, completedSweeps: 1,
      sweepDurationMs: 500, backlogAgeMs: 1200 };
    try {
      const loop = new ReaderValueScoringLoop({ execute: async () => result } as unknown as RunReaderValueTickUseCase);
      await loop.tick();
      expect(log).toHaveBeenCalledWith(expect.any(String), { ...result, fatalFailureCode: result.fatalFailureCode ?? undefined, restartRequired: health === 'provider_paused' });
      await loop.onModuleDestroy();
    } finally { log.mockRestore(); }
  });
  it('has one outstanding tick and waits for it during shutdown', async () => {
    let finish!: (result: { health: 'ok' }) => void;
    const execute = jest.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const loop = new ReaderValueScoringLoop({ execute } as unknown as RunReaderValueTickUseCase);
    const tick = loop.tick();
    await loop.tick();
    expect(execute).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stop = loop.onModuleDestroy().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    finish({ health: 'ok' });
    await tick; await stop; await loop.tick();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('keeps cleanup independently runnable while scoring is fatally paused', async () => {
    const execute = jest.fn().mockResolvedValue({ health: 'provider_paused' });
    const cleanupExecute = jest.fn().mockResolvedValue({ ok: true, value: {
      deleted: 1, deferredActiveJob: 0, deferredHold: 0, deferredUnknownPolicy: 0,
    } });
    const scoring = new ReaderValueScoringLoop({ execute } as unknown as RunReaderValueTickUseCase);
    const cleanup = new ReaderValueCleanupLoop({ execute: cleanupExecute } as unknown as CleanupReaderValueCacheUseCase,
      resolveReaderValueCleanupOptions({ READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS: '[]' }));
    await scoring.tick(); await cleanup.tick();
    expect(cleanupExecute).toHaveBeenCalledTimes(1);
    await scoring.onModuleDestroy(); await cleanup.onModuleDestroy();
  });
});
