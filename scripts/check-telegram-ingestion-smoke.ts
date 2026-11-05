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
import { HttpTelegramPreviewClient } from '../libs/ingestion/adapters/source/telegram/http-telegram-preview-client';
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
  // Only transport is synthetic; exercise the real HTTP adapter and HTML parser.
  const provider = new TelegramSourceProvider(new HttpTelegramPreviewClient(1000, async (request) => {
    const before = Number(new URL(request.url).searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
    const messages = posts.filter((post) => post.id < before).slice(0, 2).map((post) =>
      `<div class="tgme_widget_message" data-post="example_channel/${post.id}">` +
      `<div class="tgme_widget_message_text js-message_text">${post.text}</div>` +
      `<a class="tgme_widget_message_date"><time datetime="${post.publishedAt!.toISOString()}"></time></a></div>`).join('');
    return { status: 200, headers: new Headers(), finalUrl: request.url,
      body: `<div class="tgme_channel_info_header_username">@example_channel</div><section class="tgme_channel_history">${messages}</section>` };
  }), clock);
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
    if (reporter.succeeded?.collectionTelemetry?.collectionComplete !== true ||
        reporter.succeeded?.collectionTelemetry?.contentComplete !== false) {
      throw new Error('Coverage and content completeness must be persisted independently');
    }
    if (state().userState !== 'content_current' || state().operatorAction !== 'no_action_required') {
      throw new Error('Content limitations must not request traversal repair when all post identities were retained');
    }
    const feed = await feedItems.list({ tenantId: tenant, workspaceId: workspace, interestId: 'topic-telegram-smoke', limit: 10 });
    if (feed.items.length !== 6 || reporter.failed !== undefined) throw new Error('Expected six projected Telegram posts, including captionless content, and no failure');
    const finalRepeat = await scan('telegram-content-repeat');
    if (finalRepeat.inserted !== 0 || state().userState !== 'content_current') {
      throw new Error('An old captionless preview must not degrade the empty repeat');
    }
    console.log('Telegram ingestion smoke OK: persisted resume, dedupe, feed projection and incomplete status');
  } finally { await runtime.onApplicationShutdown('telegram-smoke-complete'); }
};
void run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
