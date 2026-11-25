import { createHash, randomUUID } from 'node:crypto';
import { HackerNewsSourceProvider } from '@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { HttpHackerNewsClient } from '@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { readScanPasses } from '@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-scan-pass-support';
import { SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { privateOutputPath, publishPrivateHnBytes, readReconciliation } from './generate-hn-archive-missing-manifest';
import { configuredHnArchiveScan } from './lib/hn-archive-configured-scan';
import { discoverHnArchiveDay } from './lib/hn-archive-discovery';
import { observedHnArchiveClient } from './lib/hn-archive-observed-client';
import { parseHnArchiveSnapshot } from './lib/hn-archive-snapshot';
import { sha256 } from './lib/hn-rss-recovery-plan';

async function main(): Promise<void> {
  if (process.argv.length !== 5 && !(process.argv.length === 6 && process.argv[5] === '--observed')) {
    throw new Error('Expected private snapshot, UTC day, private output and optional observed mode');
  }
  const observed = process.argv[5] === '--observed';
  const [, , snapshotPath, day, outputPath] = process.argv as [string, string, string, string, string];
  const target = await privateOutputPath(outputPath);
  const bytes = await readReconciliation(snapshotPath);
  const snapshot = parseHnArchiveSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  const source = observedHnArchiveClient(new HttpHackerNewsClient());
  const provider = new HackerNewsSourceProvider(observed ? source.client : new HttpHackerNewsClient(), new SystemClock());
  const context = { tenantId: tenantId(snapshot.scope.tenantId), workspaceId: workspaceId(snapshot.scope.workspaceId),
    sourceBindingId: snapshot.scope.sourceBindingId, scanJobId: `hn-discovery-${randomUUID()}`,
    correlationId: `hn-discovery-${randomUUID()}`, config: snapshot.config };
  const scan = configuredHnArchiveScan({ provider, context, passes: readScanPasses(snapshot.config) });
  const deadline = Date.now() + 15 * 60_000;
  const result = await discoverHnArchiveDay({ day, existing: snapshot.existingIds, scan,
    ...(observed ? { initialWindowHours: 6 as const } : {}),
    onProgress: scans => {
      if (Date.now() > deadline) throw new Error('HN discovery time budget exceeded');
      process.stderr.write(`HN discovery windows started: ${scans}\n`);
    } });
  const reconciliation = { days: { [day]: { missingCount: result.missingCount, missing: result.missing } },
    totals: { missing: result.missingCount }, provenance: { coverage: observed ? 'PARTIAL_ARCHIVED_OBSERVATIONS' : 'bounded_provider_scan', scope: snapshot.scope,
      snapshotObservedAt: snapshot.observedAt, snapshotSha256: createHash('sha256').update(bytes).digest('hex'),
      configSha256: sha256(snapshot.config), windowsScanned: result.scans, incompleteSearches: source.incompleteSearches() } };
  await publishPrivateHnBytes(target, Buffer.from(`${JSON.stringify(reconciliation)}\n`, 'utf8'));
  process.stdout.write(`${JSON.stringify({ day, missing: result.missingCount, windows: result.scans,
    coverage: reconciliation.provenance.coverage, incompleteSearches: source.incompleteSearches() })}\n`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    const known = new Map([
      ['Hacker News historical search incomplete: duration budget exhausted', 'SEARCH_DEADLINE'],
      ['Hacker News historical scan incomplete: duration budget exhausted', 'SCAN_DEADLINE'],
      ['Hacker News historical search incomplete: request budget exhausted', 'REQUEST_BUDGET'],
      ['Hacker News historical search incomplete: unknown Algolia coverage', 'UNKNOWN_COVERAGE'],
      ['Hacker News historical search incomplete: provider pagination ceiling', 'PAGINATION_CEILING'],
      ['Hacker News historical search incomplete: inconsistent Algolia page', 'INCONSISTENT_PAGE'],
      ['Hacker News historical search incomplete: missing, duplicate or unbounded hits', 'INVALID_HITS'],
      ['HN discovery provider coverage incomplete', 'INCOMPLETE_COVERAGE'],
      ['HN discovery scan budget exceeded', 'WINDOW_BUDGET'],
      ['HN discovery time budget exceeded', 'OVERALL_DEADLINE'],
    ]);
    const status = /^Hacker News provider returned HTTP ([1-5]\d\d)$/u.exec(message)?.[1];
    const category = status === undefined ? known.get(message) ?? 'REFUSED_OR_UNCERTAIN' : `HTTP_${status}`;
    process.stderr.write(`HN discovery ${category}; inspect output before retrying\n`);
    process.exitCode = 1;
  });
}
