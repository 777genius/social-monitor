import { FixedClock } from '@social-monitor/shared-kernel';

import type { FetchedConversationUnit, SourceFetcherPort } from '@social-monitor/ingestion/ports';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import {
  FakeFeedProjection,
  FakeScanAttemptRepository,
  FakeScanCursorRepository,
  FakeScanExecutionReporter,
  FakeScanFailureQueue,
  FakeScanLease,
  FakeSourceItemRepository,
  SequenceIdGenerator,
  makeExecuteScanCommand,
} from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case.spec-support';

import { InMemoryConversationUnitRepository } from '../persistence/in-memory-conversation-unit.repository';
import { ConversationUnitProjectionAdapter } from './conversation-unit-projection.adapter';

const observedAt = new Date('2026-09-23T17:00:00.000Z');
const publishedAt = new Date('2026-09-23T16:30:00.000Z');
const root = {
  externalId: 'hn:1',
  canonicalUrl: 'https://news.ycombinator.com/item?id=1',
  title: 'Synthetic story',
  body: '',
  publishedAt,
};
const comment: FetchedConversationUnit = {
  rootExternalId: 'hn:1',
  rootProviderItemId: '1',
  providerUnitId: 'hn:10',
  canonicalUrl: 'https://news.ycombinator.com/item?id=10',
  body: 'Synthetic comment',
  publishedAt,
  threadExternalId: 'hn:1',
  depth: 0,
  role: 'top_level_comment',
};

const runProjection = async (options: {
  unit: FetchedConversationUnit;
  historical: boolean;
  withRoot?: boolean;
  scanPolicy?: { readonly attemptNumber: number; readonly retryBudget: number };
}) => {
  const fetcher: SourceFetcherPort = {
    async fetch() {
      return {
        items: options.withRoot === false ? [] : [root],
        conversationUnits: [options.unit],
        nextCursor: 'after-comment',
        ...(options.historical ? { telemetry: {
          targetItemCount: 1,
          collectedItemCount: 1,
          acceptedItemCount: 1,
          outsideWindowItemCount: 0,
          pageCount: 1,
          paginationDuplicateItemCount: 0,
          paginationStopReason: 'single_page' as const,
          rateLimitEventCount: 0,
          targetPublishedWindowStartedAt: new Date('2026-09-23T16:00:00.000Z'),
          targetPublishedWindowEndedAt: observedAt,
        } } : {}),
      };
    },
  };
  const conversationRepository = new InMemoryConversationUnitRepository();
  const attempts = new FakeScanAttemptRepository();
  const reporter = new FakeScanExecutionReporter();
  const cursors = new FakeScanCursorRepository();
  const sourceItems = new FakeSourceItemRepository();
  const feed = new FakeFeedProjection();
  const ids = new SequenceIdGenerator();
  const failures = new FakeScanFailureQueue();
  const useCase = new ExecuteScanUseCase(
    fetcher, sourceItems, feed, attempts, cursors, reporter,
    failures, new FakeScanLease(), ids,
    new FixedClock(observedAt), undefined, undefined,
    new ConversationUnitProjectionAdapter(conversationRepository, ids),
  );
  const command = makeExecuteScanCommand({ providerKey: 'hacker-news', ...options.scanPolicy });
  cursors.seed({ tenantId: command.tenantId, workspaceId: command.workspaceId,
    sourceBindingId: command.sourceBindingId, cursor: 'before-comment', committedAt: publishedAt });
  const result = await useCase.execute(command);
  const attempt = await attempts.findByScanJob(command);
  return { result, attempt: attempt?.toSnapshot(), reporter, cursors, failures,
    sourceItems, feed, conversationRepository };
};

describe('historical conversation projection completeness', () => {
  describe.each([
    { name: 'with retry attempts remaining', attemptNumber: 1, retryBudget: 3, terminal: false },
    { name: 'after the retry budget is exhausted', attemptNumber: 3, retryBudget: 3, terminal: true },
  ])('$name', (policy) => {
    it.each([
      ['invalid', { ...comment, body: '   ' }, true],
      ['orphan', { ...comment, rootExternalId: 'hn:missing' }, true],
      ['orphan without a projected root', comment, false],
    ] as const)('fails a historical scan when the real projection skips an %s unit', async (_name, unit, withRoot) => {
      const projected = await runProjection({ unit, historical: true, withRoot, scanPolicy: policy });

      expect(projected.result.ok).toBe(false);
      if (!projected.result.ok) {
        expect(projected.result.error.message).toContain('Historical conversation projection incomplete');
      }
      expect(projected.attempt?.status).toBe('failed');
      expect(projected.attempt?.terminalFailure).toBe(policy.terminal);
      expect(projected.reporter.succeeded).toEqual([]);
      expect(projected.reporter.failed).toHaveLength(policy.terminal ? 1 : 0);
      if (policy.terminal) {
        expect(projected.failures.retries).toEqual([]);
        expect(projected.failures.deadLetters).toEqual([
          expect.objectContaining({ attemptNumber: 3, retryBudget: 3,
            failureReason: expect.stringContaining('Historical conversation projection incomplete') }),
        ]);
      } else {
        expect(projected.failures.retries).toEqual([
          expect.objectContaining({ attemptNumber: 1, nextAttemptNumber: 2, retryBudget: 3,
            failureReason: expect.stringContaining('Historical conversation projection incomplete') }),
        ]);
        expect(projected.failures.deadLetters).toEqual([]);
      }
      expect(projected.cursors.saved).toEqual([]);
      await expect(projected.cursors.findBySourceBinding()).resolves.toMatchObject({ cursor: 'before-comment' });
      expect(projected.conversationRepository.all()).toEqual([]);
    });
  });

  it('preserves ordinary collection completion when an invalid unit is skipped', async () => {
    const projected = await runProjection({ unit: { ...comment, body: '   ' }, historical: false });

    expect(projected.result.ok).toBe(true);
    expect(projected.attempt?.status).toBe('succeeded');
    expect(projected.reporter.succeeded).toHaveLength(1);
    expect(projected.conversationRepository.all()).toEqual([]);
    await expect(projected.cursors.findBySourceBinding()).resolves.toMatchObject({ cursor: 'after-comment' });
  });
});
