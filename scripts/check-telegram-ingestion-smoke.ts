import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { CryptoIdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import type { TelegramPreviewPost } from '../libs/ingestion/adapters/source/telegram/telegram-preview-client.port';
import { readTelegramCursor } from '../libs/ingestion/adapters/source/telegram/telegram-preview-cursor';
import { buildScanStatusView } from '../libs/monitoring/features/shared/scan-status-view';
import { TelegramSourceProvider } from '../libs/ingestion/adapters/source/telegram/telegram-source.provider';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
} from '../libs/ingestion/ports';

class SmokeScanExecutionReporter implements ScanExecutionReporterPort {
  succeeded: ReportScanSucceededCommand | undefined;
  failed: ReportScanFailedCommand | undefined;

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded = command;
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed = command;
  }
}

const run = async (): Promise<void> => {
  const clock = { now: () => new Date('2026-10-18T12:00:00.000Z') };
  const tenant = tenantId('00000000-0000-7000-8000-000000000901');
  const workspace = workspaceId('00000000-0000-7000-8000-000000000902');
  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const reporter = new SmokeScanExecutionReporter();
  const posts: TelegramPreviewPost[] = [5, 4, 3, 2, 1].map((id) => ({
    id, text: `Synthetic public post ${id}`, publishedAt: clock.now(), links: [], incomplete: false,
  }));
  const provider = new TelegramSourceProvider({ readPage: async (_channel, before) => ({
    posts: posts.filter((post) => before === undefined || post.id < before).slice(0, 2), warnings: [],
  }) }, clock);
  const executeScan = new ExecuteScanUseCase(
    new CircuitBreakerSourceFetcherAdapter(new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([provider], sourceReadinessProfiles),
    ), clock, { failureThreshold: 3, cooldownSeconds: 60 }),
    sourceItems, new InMemoryFeedProjectionAdapter(feedItems), new InMemoryScanAttemptRepository(),
    scanCursors, reporter, new InMemoryScanFailureQueueAdapter(metrics), new InMemoryScanLeaseAdapter(),
    new CryptoIdGenerator(), clock,
  );
  const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  runtime.onModuleInit();
  try {
    const handler = new ExecuteScanCommandHandler(executeScan, metrics, runtime);
    const scan = async (id: string) => handler.handle({
      commandId: id, commandType: 'ingestion.scan.execute', correlationId: id, schemaVersion: 1,
      payload: { tenantId: tenant, workspaceId: workspace, scanJobId: id,
        interestId: 'topic-telegram-smoke', sourceBindingId: 'telegram-binding-smoke',
        scanPolicyId: 'telegram-policy-smoke', providerKey: 'telegram',
        sourceQuery: { mode: 'account_feed', query: '@example_channel', parameters: { maxItems: 2 } },
      },
    });
    const state = () => buildScanStatusView({ status: 'succeeded', executionMetadata: reporter.succeeded?.collectionTelemetry });
    await scan('telegram-first');
    if (state().userState !== 'scan_degraded' || state().operatorAction !== 'wait_for_collection_backfill') {
      throw new Error('Partial collection must be degraded with a backfill action');
    }
    await scan('telegram-second');
    await scan('telegram-third');
    const cursor = await scanCursors.findBySourceBinding({ tenantId: tenant, workspaceId: workspace, sourceBindingId: 'telegram-binding-smoke' });
    if (readTelegramCursor(cursor?.cursor, 'example_channel', 'live').lastId !== 5 || state().userState !== 'content_current') {
      throw new Error('Backfill must persist its completed watermark and clear degraded status');
    }
    const repeated = await scan('telegram-repeat');
    if (repeated.inserted !== 0 || repeated.fetched !== 0) throw new Error('Repeated scans must not duplicate posts');
    posts.unshift({ id: 6, text: '', publishedAt: clock.now(), links: [], incomplete: true });
    await scan('telegram-unsupported');
    if (state().userState !== 'scan_degraded' || state().operatorAction !== 'inspect_incomplete_source_content') {
      throw new Error('Unsupported-only collection must remain visibly incomplete with zero items');
    }
    const feed = await feedItems.list({ tenantId: tenant, workspaceId: workspace, interestId: 'topic-telegram-smoke', limit: 10 });
    if (feed.items.length !== 5 || reporter.failed !== undefined) throw new Error('Expected five projected Telegram posts and no failure');
    console.log('Telegram ingestion smoke OK: persisted resume, dedupe, feed projection and incomplete status');
  } finally { await runtime.onApplicationShutdown('telegram-smoke-complete'); }
};
void run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
