import { readTelegramCursor } from '@social-monitor/ingestion/adapters/source/telegram/telegram-preview-cursor';
import type { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import type { CollectionScanExecution } from './collection-scan-execution';
import {
  telegramCollectionChannel, telegramCollectionScope, TelegramCollectionError, type TelegramCollectionTarget,
  type TelegramCollectionOperationalState,
} from './telegram-channel-collection-contract';

export const summarizeTelegramCollectionCursor = (raw: string | undefined) => {
  if (raw === undefined) return null;
  try {
    const cursor = readTelegramCursor(raw, telegramCollectionChannel, 'live');
    const stored: unknown = JSON.parse(Buffer.from(raw.slice('telegram.preview.v1:'.length), 'base64url').toString('utf8'));
    if (stored === null || typeof stored !== 'object' || !('scope' in stored) || stored.scope !== 'live') {
      throw new TelegramCollectionError('binding_conflict');
    }
    return {
      lastId: cursor.lastId, backfillPending: cursor.pending !== undefined,
      ...(cursor.pending === undefined ? {} : { beforeId: cursor.pending.beforeId, ceilingId: cursor.pending.ceilingId }),
      ...(cursor.retryAfterUntil === undefined ? {} : { retryAfterUntil: cursor.retryAfterUntil }),
      ...(cursor.historyGap === undefined ? {} : { historyGap: cursor.historyGap }),
    };
  } catch { throw new TelegramCollectionError('binding_conflict'); }
};

export const collectTelegramChannel = async (
  target: TelegramCollectionTarget,
  runtime: { readonly executeScan: Pick<ExecuteScanUseCase, 'execute'>; readonly execution: CollectionScanExecution;
    readonly operationalState?: () => TelegramCollectionOperationalState },
) => {
  const scope = { ...telegramCollectionScope, sourceBindingId: target.sourceBindingId };
  const prior = await runtime.execution.scanCursors.findBySourceBinding(scope);
  const cursorBefore = summarizeTelegramCollectionCursor(prior?.cursor);
  const scanJobId = runtime.execution.scanJobIdForAttempt({ ...scope, scanPolicyId: target.scanPolicyId });
  const result = await runtime.executeScan.execute({
    ...scope, scanJobId, scanPolicyId: target.scanPolicyId, providerKey: 'telegram',
    sourceQuery: { mode: 'account_feed', query: telegramCollectionChannel }, interestQuerySnapshot: target.interestQuery,
    correlationId: runtime.execution.correlationId, causationId: runtime.execution.causationId,
    retryBudget: 0, leaseTtlSeconds: 600,
  });
  const after = await runtime.execution.scanCursors.findBySourceBinding(scope);
  if (!result.ok) {
    const state = runtime.operationalState?.();
    if (state?.fetchFailed !== true || state.failureReported !== true || prior?.cursor !== after?.cursor) {
      throw new TelegramCollectionError('collection_failed');
    }
    return {
      scanJobId, sourceBindingId: target.sourceBindingId, scanPolicyId: target.scanPolicyId,
      status: 'deferred' as const, deferred: true as const, failureStage: 'provider_fetch' as const,
      fetched: 0, inserted: 0, projected: 0, skippedDuplicates: 0, warningCount: 0, pageCount: 0,
      complete: false, backfillPending: cursorBefore?.backfillPending ?? false,
      cursorBefore, cursorAfter: summarizeTelegramCollectionCursor(after?.cursor),
    };
  }
  const value = result.value;
  return {
    scanJobId, sourceBindingId: target.sourceBindingId, scanPolicyId: target.scanPolicyId,
    status: value.telemetry?.collectionComplete === true ? 'complete' as const : 'partial' as const,
    fetched: value.fetched, inserted: value.inserted, projected: value.projected, skippedDuplicates: value.skippedDuplicates,
    warningCount: value.warnings.length, pageCount: value.telemetry?.pageCount ?? 0,
    complete: value.telemetry?.collectionComplete === true, backfillPending: value.telemetry?.backfillPending ?? false,
    cursorBefore, cursorAfter: summarizeTelegramCollectionCursor(after?.cursor),
  };
};
