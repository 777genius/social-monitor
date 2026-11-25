import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readPublicDefaults } from './local-config';
import { loadBootstrapState, saveBootstrapState } from './bootstrap-state';

const starters = [
  { key: 'hacker-news', config: { mode: 'listing', listing: 'top', maxItems: 12 } },
  { key: 'rss', config: { feedUrl: 'https://simonwillison.net/atom/everything/', maxItems: 10, maxItemAgeHours: 168 } },
] as const;

async function main(): Promise<void> {
  const directory = process.env.SELFHOST_BOOTSTRAP_STATE_DIR ?? '/state';
  const lock = join(directory, 'bootstrap.lock');
  // A second installer must not race source creation or request a different window.
  await mkdir(lock, { mode: 0o700 });
  try { await bootstrap(directory); }
  finally { await rmdir(lock); }
}

async function bootstrap(directory: string): Promise<void> {
  const defaults = await readPublicDefaults();
  const token = process.env.SELFHOST_BEARER_TOKEN;
  if (!token) throw new Error('owner_credential_missing');
  const state = await loadBootstrapState(directory);
  const save = () => saveBootstrapState(directory, state);
  const request = async <T>(path: string, body?: unknown, key?: string): Promise<T> => {
    const response = await fetch(`http://api:3000${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': defaults.SOCIAL_MONITOR_TENANT_ID,
        'x-workspace-id': defaults.SOCIAL_MONITOR_WORKSPACE_ID,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key === undefined ? {} : { 'idempotency-key': `selfhost-v1-${key}` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`api_request_failed:${response.status}:${path}`);
    return await response.json() as T;
  };
  if (state.readerSummaryId !== undefined) {
    await request(`/reader-summaries/${state.readerSummaryId}`);
    console.log(`First summary already ready: ${state.readerSummaryId}`);
    return;
  }
  if (state.interestId === undefined) {
    const result = await request<{ interestId: string }>('/interests', {
      name: 'AI and practical engineering', query: 'AI developer tools and practical software engineering',
    }, 'interest');
    state.interestId = result.interestId;
    await save();
  }
  for (const source of starters) {
    let entry = state.sources[source.key];
    if (entry === undefined) {
      const result = await request<{ sourceBindingId: string }>(`/interests/${state.interestId}/source-bindings`, {
        providerKey: source.key, config: source.config,
      }, `binding-${source.key}`);
      entry = { bindingId: result.sourceBindingId };
      state.sources[source.key] = entry;
      await save();
    }
    // Policy creation is idempotent; existing user settings are preserved on later starts.
    if (entry.scanJobId === undefined) {
      await request(`/source-bindings/${entry.bindingId}/scan-policy`, {
        intervalSeconds: 900, freshnessSeconds: 7200, retryBudget: 2,
      }, `policy-${source.key}`);
      const scan = await request<{ scanJobId: string }>(`/source-bindings/${entry.bindingId}/scan-requests`, {}, `scan-${source.key}`);
      entry.scanJobId = scan.scanJobId;
      await save();
    }
    console.log(`Collecting ${source.key}…`);
    const scan = await waitFor(() => request<{ status: string; latestAttempt?: { inserted: number; fetched: number } }>(
      `/scan-requests/${entry.scanJobId}/status`,
    ), ['succeeded'], ['failed'], 15 * 60_000);
    console.log(`${source.key}: ${scan.latestAttempt?.fetched ?? 0} fetched.`);
  }
  if (process.argv.includes('--collect-only')) {
    console.log('Starter sources ready. AI can be configured later.');
    return;
  }
  if (state.period === undefined) {
    const endedAt = new Date();
    state.period = { startedAt: new Date(endedAt.getTime() - 86_400_000).toISOString(), endedAt: endedAt.toISOString(), timezone: 'UTC' };
    await save();
  }
  if (state.readerSummaryJobId === undefined) {
    const job = await request<{ readerSummaryJobId: string }>('/reader-summary-requests', {
      scope: { type: 'workspace' }, cadence: 'daily', period: state.period,
    }, 'first-summary');
    state.readerSummaryJobId = job.readerSummaryJobId;
    await save();
  }
  console.log(`Preparing first summary (${state.readerSummaryJobId}). This can take several minutes…`);
  const result = await waitFor(() => request<{ status: string; readerSummaryId?: string }>(
    `/reader-summary-jobs/${state.readerSummaryJobId}/status`,
  ), ['completed'], ['failed', 'quality_rejected', 'no_signal'], 45 * 60_000);
  if (result.readerSummaryId === undefined) throw new Error('completed_summary_id_missing');
  await request(`/reader-summaries/${result.readerSummaryId}`);
  state.readerSummaryId = result.readerSummaryId;
  await save();
  console.log(`First summary ready: ${result.readerSummaryId}`);
}

async function waitFor<T extends { status: string }>(
  read: () => Promise<T>, success: readonly string[], failure: readonly string[], timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (success.includes(value.status)) return value;
    if (failure.includes(value.status)) throw new Error(`job_terminal:${value.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('observation_timeout_existing_job_preserved');
}

void main().catch((error: unknown) => {
  // Only our bounded codes are logged; never dump HTTP payloads or model credentials.
  const message = error instanceof Error ? error.message : '';
  console.error(/^api_request_failed:|^job_terminal:|^observation_timeout_/u.test(message) ? message : 'First-run setup failed. Check service health and private bootstrap state.');
  console.error('Existing data and job IDs were preserved. Run start.sh again to resume.');
  process.exitCode = 1;
});
