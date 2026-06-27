import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { Pool } from 'pg';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceFetcherPort,
} from '@social-monitor/ingestion/ports';
import { InMemoryOutboxAdapter } from '@social-monitor/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryIdempotencyAdapter } from '@social-monitor/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryTopicRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-topic.repository';
import { CreateTopicUseCase } from '@social-monitor/monitoring/features/create-topic/create-topic.use-case';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import {
  FixedClock,
  type DomainError,
  type IdGenerator,
  type Result,
  ok,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';
import { FeedSummaryEvidenceSelector } from '@social-monitor/summary/adapters/evidence/feed-summary-evidence.selector';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { InMemorySummaryJobQueueAdapter } from '@social-monitor/summary/adapters/messaging/in-memory-summary-job-queue.adapter';
import { MemoStackSummaryMemoryAdapter } from '@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter';
import { defaultMemoStackTimeoutMs } from '@social-monitor/summary/adapters/memory/memo-stack-memory-client';
import { DeterministicSummaryModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-summary-model.adapter';
import { NoopUserSummaryPreferenceReader } from '@social-monitor/summary/adapters/preferences/noop-user-summary-preference.reader';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryFeedbackRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-feedback.repository';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository';
import { SummaryPolicy } from '@social-monitor/summary/domain';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { RecordSummaryFeedbackUseCase } from '@social-monitor/summary/features/record-summary-feedback/record-summary-feedback.use-case';
import { RequestSummaryUseCase } from '@social-monitor/summary/features/request-summary/request-summary.use-case';
import {
  providerQualityScope,
  spaceSlug,
  topicFeedbackScope,
  userPreferenceScope,
} from '@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter';
import type {
  ReserveSummaryJobQuotaResult,
  SummaryMemoryPort,
  SummaryQuotaPort,
} from '@social-monitor/summary/ports';

const now = new Date('2026-06-06T00:00:00.000Z');
type ProductLoopMode = 'fixture' | 'live';
const mode = resolveProductLoopMode(process.env);
const runId = readOptionalEnv('SUMMARY_MEMORY_PRODUCT_LOOP_RUN_ID') ??
  (mode === 'live' ? `summary-memory-live-${Date.now()}` : 'summary-memory-e2e');
const requirePostgresEvidence = readBooleanEnv('SUMMARY_MEMORY_PRODUCT_LOOP_REQUIRE_POSTGRES', false);
const tenant = tenantId(`tenant-${runId}`);
const workspace = workspaceId(`workspace-${runId}`);
const userId = `user-${runId}`;
const subscriptionId = `subscription-${runId}`;
const providerKeys = ['github', 'reddit', 'hacker-news', 'rss'] as const;
type FixtureProviderKey = typeof providerKeys[number];

async function main(): Promise<void> {
  assertProductLoopEvidenceRequirements();
  const clock = new FixedClock(now);
  const ids = new SequenceIdGenerator(runId);
  const topics = new InMemoryTopicRepository();
  const feedItems = new InMemoryFeedItemReadRepository();
  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryQueue = new InMemorySummaryJobQueueAdapter(new InMemoryQueuePublisher(), new InMemoryMetricsRecorder());
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const summaryFeedback = new InMemorySummaryFeedbackRepository();
  const summaryPolicies = new InMemorySummaryPolicyRepository();
  const summaryEvents = new InMemorySummaryEventPublisher();
  const memoryBackend = mode === 'fixture' ? new MemoStackProductLoopBackend() : undefined;
  const memory = createProductLoopMemory(mode, memoryBackend);

  const topic = unwrap(await new CreateTopicUseCase(
    topics,
    new InMemoryOutboxAdapter(),
    new InMemoryIdempotencyAdapter(),
    ids,
    clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    name: 'Security monitoring',
    query: 'security monitoring',
    idempotencyKey: `${runId}:create-topic`,
    correlationId: runId,
  }), 'create topic');
  assert(topic.created, 'product loop must create a topic');

  const scanMetrics = await ingestProviderFindings(feedItems, topic.topicId, ids, clock);
  assert.equal(scanMetrics.length, providerKeys.length, 'product loop must ingest every fixture provider');
  assert.equal(feedItems.all().length, providerKeys.length, 'ingestion projection must create one feed item per provider');
  await summaryPolicies.save(SummaryPolicy.create({
    id: `${runId}-policy`,
    tenantId: tenant,
    workspaceId: workspace,
    topicId: topic.topicId,
    language: 'en',
    format: 'bullet_digest',
    tone: 'analytical',
    maxKeyPoints: 4,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions: 'Compare provider signals across GitHub, Reddit, Hacker News and RSS.',
    createdAt: now,
    updatedAt: now,
  }));

  const firstSummary = await runSummary({
    topicId: topic.topicId,
    idempotencyKey: `${runId}:first-summary`,
    summaryJobs,
    summaryQueue,
    summaryArtifacts,
    summaryPolicies,
    summaryEvents,
    feedItems,
    memory,
    ids,
    clock,
  });
  assert(!firstSummary.executiveSummary.includes('Memory context:'), 'first summary must start without memory');
  assertProviderCoverage(firstSummary.citationProviders);
  const feedbackCitationId = citationIdForProvider(firstSummary.citationIdByProvider, 'reddit');

  const feedback = unwrap(await new RecordSummaryFeedbackUseCase(
    summaryArtifacts,
    summaryFeedback,
    ids,
    clock,
    memory,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: firstSummary.summaryId,
    submittedBy: userId,
    rating: 2,
    category: 'too_verbose',
    comment: 'Make the next digest shorter, prioritize GitHub security evidence, and down-rank low-signal Reddit.',
    citationId: feedbackCitationId,
    idempotencyKey: `${runId}:feedback`,
    correlationId: runId,
  }), 'record summary feedback');
  assert(feedback.created, 'feedback must be recorded');
  if (memoryBackend === undefined) {
    await waitForLiveMemory({ topicId: topic.topicId, feedItems, memory, clock });
  } else {
    assert.equal(memoryBackend.captureBodies.length, 3, 'feedback must be mirrored into topic, provider and user memo-stack captures');
    assert.equal(memoryBackend.factBodies.length, 3, 'feedback must be mirrored into topic, provider and user memo-stack fact writes');
    assert.equal(memoryBackend.captureBodies[0]?.memory_scope_external_ref, topicFeedbackScope(topic.topicId));
    assert.equal(memoryBackend.captureBodies[1]?.memory_scope_external_ref, providerQualityScope(topic.topicId, 'reddit'));
    assert.equal(memoryBackend.captureBodies[2]?.memory_scope_external_ref, userPreferenceScope(userId));
    assert.equal(memoryBackend.factBodies[0]?.memory_scope_external_ref, topicFeedbackScope(topic.topicId));
    assert.equal(memoryBackend.factBodies[1]?.memory_scope_external_ref, providerQualityScope(topic.topicId, 'reddit'));
    assert.equal(memoryBackend.factBodies[2]?.memory_scope_external_ref, userPreferenceScope(userId));
    assert.equal(memoryBackend.factBodies[2]?.category, 'relevance_quality');
    assert(
      String(memoryBackend.factBodies[2]?.text ?? '').includes('down-rank similar reddit evidence'),
      'user preference fact must carry ranking guidance for the next readerSummary',
    );
  }

  const secondSummary = await runSummary({
    topicId: topic.topicId,
    idempotencyKey: `${runId}:second-summary`,
    summaryJobs,
    summaryQueue,
    summaryArtifacts,
    summaryPolicies,
    summaryEvents,
    feedItems,
    memory,
    ids,
    clock,
  });
  assertProviderCoverage(secondSummary.citationProviders);
  assert.notEqual(secondSummary.executiveSummary, firstSummary.executiveSummary);
  assertMemoryInfluencedSummary(secondSummary.executiveSummary, mode);
  const postgresEvidence = mode === 'live'
    ? await maybeCheckLivePostgresEvidence({
        topicId: topic.topicId,
        summaryId: firstSummary.summaryId,
        citationId: feedbackCitationId,
        providerKey: 'reddit',
      })
    : undefined;
  if (memoryBackend !== undefined) {
    assert.equal(memoryBackend.contextBodies.length, 2, 'summary generation must read memory once per summary');
    assert.deepEqual(memoryBackend.contextBodies[1]?.memory_scope_external_refs, [
      `subscription:${subscriptionId}:preferences`,
      `user:${userId}:preferences`,
      `topic:${topic.topicId}:preferences`,
      'workspace-global',
      providerQualityScope(topic.topicId, 'github'),
      providerQualityScope(topic.topicId, 'hacker-news'),
      providerQualityScope(topic.topicId, 'reddit'),
      providerQualityScope(topic.topicId, 'rss'),
      `topic:${topic.topicId}:feedback`,
    ]);
    assert(
      String(memoryBackend.contextBodies[1]?.query ?? '').includes('provider distribution: github=1, hacker-news=1, reddit=1, rss=1'),
      'memo-stack context query must carry provider distribution',
    );
  }

  console.log([
    `Summary memory ${mode} product loop OK`,
    `Run id: ${runId}`,
    `First summary: ${firstSummary.summaryId}`,
    `Second summary: ${secondSummary.summaryId}`,
    `Providers: ${secondSummary.citationProviders.sort().join(', ')}`,
    `Memory fact writes: ${memoryBackend?.factBodies.length ?? 'live-runtime'}`,
    `Postgres evidence: ${formatPostgresEvidence(postgresEvidence)}`,
    `Scans: ${scanMetrics.map((scan) => `${scan.providerKey}:${scan.projected}`).join(', ')}`,
  ].join('\n'));
}

function createProductLoopMemory(
  currentMode: ProductLoopMode,
  memoryBackend: MemoStackProductLoopBackend | undefined,
): SummaryMemoryPort {
  if (currentMode === 'live') {
    return new MemoStackSummaryMemoryAdapter({
      baseUrl: requiredEnv('INFINITY_CONTEXT_URL'),
      token: requiredEnv('INFINITY_CONTEXT_TOKEN'),
      timeoutMs: readPositiveIntegerEnv('SUMMARY_MEMORY_TIMEOUT_MS', defaultMemoStackTimeoutMs, 1_000, 60_000),
    });
  }

  assert(memoryBackend !== undefined, 'fixture product loop requires fake memory backend');
  return new MemoStackSummaryMemoryAdapter({
    baseUrl: 'https://memory.example.test/api/',
    token: 'summary-memory-product-loop-token',
    fetchFn: memoryBackend.fetch,
  });
}

async function waitForLiveMemory(params: {
  readonly topicId: string;
  readonly feedItems: InMemoryFeedItemReadRepository;
  readonly memory: SummaryMemoryPort;
  readonly clock: FixedClock;
}): Promise<void> {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const context = await params.memory.buildContext(memoryQuery(params.topicId, params.feedItems, params.clock.now()));
    if (
      context.status === 'available' &&
      hasProviderQualityMemory(context.renderedText)
    ) {
      return;
    }
    await sleep(500);
  }

  throw new Error('live memo-stack did not return the recorded summary feedback memory');
}

async function maybeCheckLivePostgresEvidence(params: {
  readonly topicId: string;
  readonly summaryId: string;
  readonly citationId: string;
  readonly providerKey: string;
}): Promise<PostgresEvidence | undefined> {
  const databaseUrl = readOptionalEnv('SUMMARY_MEMORY_PRODUCT_LOOP_POSTGRES_URL');
  if (databaseUrl === undefined) {
    if (requirePostgresEvidence) {
      throw new Error('SUMMARY_MEMORY_PRODUCT_LOOP_POSTGRES_URL is required when SUMMARY_MEMORY_PRODUCT_LOOP_REQUIRE_POSTGRES=true');
    }
    return undefined;
  }

  const timeoutMs = readPositiveIntegerEnv('SUMMARY_MEMORY_PRODUCT_LOOP_POSTGRES_TIMEOUT_MS', 5_000, 1_000, 30_000);
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 1_000,
    max: 1,
  });
  try {
    const memorySpaceSlug = spaceSlug(tenant, workspace);
    const memoryScopeRef = topicFeedbackScope(params.topicId);
    const providerScopeRef = providerQualityScope(params.topicId, params.providerKey);
    const userScopeRef = userPreferenceScope(userId);
    const topicCaptures = await countRows(pool, `
      select count(*)::int as count
      from memory_captures c
      join memory_spaces sp on sp.id = c.space_id
      join memory_scopes s on s.id = c.memory_scope_id
      where sp.slug = $1
        and s.external_ref = $2
        and c.source_agent = 'social-monitor.summary-feedback'
        and c.event_type = 'social-monitor.summary_feedback.recorded'
        and c.status = 'accepted'
        and c.metadata_json->>'topic_id' = $3
        and c.metadata_json->>'summary_id' = $4
        and c.metadata_json->>'citation_id' = $5
        and c.metadata_json->>'memory_action' = 'prefer_shorter_summary'
        and c.metadata_json->>'provider_quality_action' = 'downrank_low_signal_provider'
        and c.metadata_json->>'provider_quality_scope' = $6
    `, [memorySpaceSlug, memoryScopeRef, params.topicId, params.summaryId, params.citationId, providerScopeRef]);
    const providerCaptures = await countRows(pool, `
      select count(*)::int as count
      from memory_captures c
      join memory_spaces sp on sp.id = c.space_id
      join memory_scopes s on s.id = c.memory_scope_id
      where sp.slug = $1
        and s.external_ref = $2
        and c.source_agent = 'social-monitor.summary-provider-quality'
        and c.event_type = 'social-monitor.summary_feedback.provider_quality_recorded'
        and c.status = 'accepted'
        and c.metadata_json->>'topic_id' = $3
        and c.metadata_json->>'summary_id' = $4
        and c.metadata_json->>'citation_id' = $5
        and c.metadata_json->>'provider_quality_action' = 'downrank_low_signal_provider'
        and c.metadata_json->>'provider_quality_scope' = $2
    `, [memorySpaceSlug, providerScopeRef, params.topicId, params.summaryId, params.citationId]);
    const userPreferenceCaptures = await countRows(pool, `
      select count(*)::int as count
      from memory_captures c
      join memory_spaces sp on sp.id = c.space_id
      join memory_scopes s on s.id = c.memory_scope_id
      where sp.slug = $1
        and s.external_ref = $2
        and c.source_agent = 'social-monitor.summary-feedback-user-preference'
        and c.event_type = 'social-monitor.summary_feedback.user_preference_recorded'
        and c.status = 'accepted'
        and c.metadata_json->>'topic_id' = $3
        and c.metadata_json->>'summary_id' = $4
        and c.metadata_json->>'citation_id' = $5
        and c.metadata_json->>'memory_action' = 'downrank_similar_provider_evidence'
        and c.metadata_json->>'memory_scope_external_ref' = $2
    `, [memorySpaceSlug, userScopeRef, params.topicId, params.summaryId, params.citationId]);
    const topicFacts = await countRows(pool, `
      select count(*)::int as count
      from memory_facts f
      join memory_spaces sp on sp.id = f.space_id
      join memory_scopes s on s.id = f.memory_scope_id
      where sp.slug = $1
        and s.external_ref = $2
        and f.status = 'active'
        and f.ttl_policy = 'durable'
    `, [memorySpaceSlug, memoryScopeRef]);
    const providerFacts = await countRows(pool, `
      select count(*)::int as count
      from memory_facts f
      join memory_spaces sp on sp.id = f.space_id
      join memory_scopes s on s.id = f.memory_scope_id
      where sp.slug = $1
        and s.external_ref = $2
        and f.status = 'active'
        and f.ttl_policy = 'durable'
    `, [memorySpaceSlug, providerScopeRef]);
    const userPreferenceFacts = await countRows(pool, `
      select count(*)::int as count
      from memory_facts f
      join memory_spaces sp on sp.id = f.space_id
      join memory_scopes s on s.id = f.memory_scope_id
      where sp.slug = $1
        and s.external_ref = $2
        and f.status = 'active'
        and f.ttl_policy = 'durable'
        and f.category = 'user_preferences'
        and f.tags_json ? 'relevance-quality'
        and f.tags_json ? 'ranking-downrank-provider'
    `, [memorySpaceSlug, userScopeRef]);
    const sourceTypes = await readSourceTypes(pool, memorySpaceSlug, providerScopeRef);
    const userPreferenceSourceTypes = await readSourceTypes(pool, memorySpaceSlug, userScopeRef);

    assert(topicCaptures >= 1, 'live memo-stack Postgres evidence must include accepted feedback capture');
    assert(providerCaptures >= 1, 'live memo-stack Postgres evidence must include accepted provider quality capture');
    assert(userPreferenceCaptures >= 1, 'live memo-stack Postgres evidence must include accepted user preference capture');
    assert(topicFacts >= 1, 'live memo-stack Postgres evidence must include durable active topic fact');
    assert(providerFacts >= 1, 'live memo-stack Postgres evidence must include durable active provider fact');
    assert(userPreferenceFacts >= 1, 'live memo-stack Postgres evidence must include durable active user preference fact');
    assertRequiredSourceTypes(sourceTypes);
    assertRequiredSourceTypes(userPreferenceSourceTypes);

    return {
      captures: topicCaptures + providerCaptures + userPreferenceCaptures,
      facts: topicFacts + providerFacts + userPreferenceFacts,
      sourceTypes: uniqueSorted([...sourceTypes, ...userPreferenceSourceTypes]),
    };
  } finally {
    await pool.end();
  }
}

async function countRows(pool: Pool, sql: string, values: readonly unknown[]): Promise<number> {
  const result = await pool.query<{ readonly count: number | string }>(sql, [...values]);
  const value = result.rows[0]?.count;
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return Number(value);
  }

  throw new Error('memo-stack Postgres evidence count query returned an invalid count');
}

async function readSourceTypes(
  pool: Pool,
  memorySpaceSlug: string,
  memoryScopeRef: string,
): Promise<readonly string[]> {
  const result = await pool.query<{ readonly source_type: string }>(`
    select distinct r.source_type
    from memory_source_refs r
    join memory_facts f on f.id = r.fact_id
    join memory_spaces sp on sp.id = f.space_id
    join memory_scopes s on s.id = f.memory_scope_id
    where sp.slug = $1
      and s.external_ref = $2
    order by r.source_type
  `, [memorySpaceSlug, memoryScopeRef]);

  return result.rows.map((row) => row.source_type);
}

function assertRequiredSourceTypes(sourceTypes: readonly string[]): void {
  for (const sourceType of [
    'social-monitor.summary-feedback',
    'social-monitor.summary',
    'social-monitor.citation',
    'social-monitor.feed-item',
    'social-monitor.source-item',
  ]) {
    assert(sourceTypes.includes(sourceType), `live memo-stack Postgres evidence must include ${sourceType} source ref`);
  }
}

function formatPostgresEvidence(evidence: PostgresEvidence | undefined): string {
  return evidence === undefined
    ? 'skipped'
    : `captures=${evidence.captures}, facts=${evidence.facts}, sourceTypes=${evidence.sourceTypes.join('|')}`;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en-US'));
}

function memoryQuery(
  topicId: string,
  feedItems: InMemoryFeedItemReadRepository,
  requestedAt: Date,
): Parameters<SummaryMemoryPort['buildContext']>[0] {
  const items = feedItems.all().map((item) => item.toSnapshot());

  return {
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    userId,
    subscriptionId,
    requestedAt,
    evidence: {
      sourceWindow: {
        windowId: `window-${runId}`,
        startedAt: requestedAt,
        endedAt: new Date(requestedAt.getTime() + 1),
        selectedFeedItemIds: items.map((item) => item.id),
      },
      items: items.map((item) => ({
        feedItemId: item.id,
        sourceItemId: item.sourceItemId,
        sourceBindingId: item.sourceBindingId,
        providerKey: item.providerKey,
        title: item.title,
        bodyPreview: item.bodyPreview,
        canonicalUrl: item.canonicalUrl,
        observedAt: item.observedAt,
      })),
    },
  };
}

function assertMemoryInfluencedSummary(executiveSummary: string, currentMode: ProductLoopMode): void {
  const normalized = executiveSummary.toLocaleLowerCase('en-US');
  assert(normalized.includes('memory context:'), 'second summary must include memory-derived guidance');
  assert(normalized.includes('reddit'), 'memory-derived guidance must carry provider quality preference');
  if (currentMode === 'fixture') {
    assert(normalized.includes('shorter'), 'fixture memory must carry shorter-summary preference');
    assert(normalized.includes('down-rank'), 'fixture memory must carry provider down-rank action');
  }
}

function hasProviderQualityMemory(value: string | undefined): boolean {
  const normalized = String(value ?? '').toLocaleLowerCase('en-US');

  return normalized.includes('shorter') && normalized.includes('reddit');
}

async function ingestProviderFindings(
  feedItems: InMemoryFeedItemReadRepository,
  topicId: string,
  ids: IdGenerator,
  clock: FixedClock,
): Promise<readonly ScanMetric[]> {
  const reporter = new CapturingScanExecutionReporter();
  const executeScan = new ExecuteScanUseCase(
    new FixtureSourceFetcher(),
    new InMemorySourceItemRepository(),
    new InMemoryFeedProjectionAdapter(feedItems),
    new InMemoryScanAttemptRepository(),
    new InMemoryScanCursorRepository(),
    reporter,
    new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder()),
    new InMemoryScanLeaseAdapter(),
    ids,
    clock,
  );
  const metrics: ScanMetric[] = [];

  for (const providerKey of providerKeys) {
    const result = unwrap(await executeScan.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: `scan-${runId}-${providerKey}`,
      topicId,
      sourceBindingId: `binding-${runId}-${providerKey}`,
      scanPolicyId: `scan-policy-${runId}-${providerKey}`,
      providerKey,
      sourceQuery: { mode: 'search', query: `${runId} ${providerKey}` },
      correlationId: runId,
      causationId: `${runId}:${providerKey}`,
    }), `execute ${providerKey} fixture scan`);
    assert.equal(result.fetched, 1, `${providerKey} scan must fetch one fixture item`);
    assert.equal(result.inserted, 1, `${providerKey} scan must insert one source item`);
    assert.equal(result.projected, 1, `${providerKey} scan must project one feed item`);
    metrics.push({
      providerKey,
      fetched: result.fetched,
      inserted: result.inserted,
      projected: result.projected,
    });
  }

  assert.equal(reporter.failed.length, 0, 'fixture ingestion must not report failed scans');
  assert.equal(reporter.succeeded.length, providerKeys.length, 'fixture ingestion must report every scan success');
  return metrics;
}

async function runSummary(params: {
  readonly topicId: string;
  readonly idempotencyKey: string;
  readonly summaryJobs: InMemorySummaryJobRepository;
  readonly summaryQueue: InMemorySummaryJobQueueAdapter;
  readonly summaryArtifacts: InMemorySummaryArtifactRepository;
  readonly summaryPolicies: InMemorySummaryPolicyRepository;
  readonly summaryEvents: InMemorySummaryEventPublisher;
  readonly feedItems: InMemoryFeedItemReadRepository;
  readonly memory: SummaryMemoryPort;
  readonly ids: IdGenerator;
  readonly clock: FixedClock;
}): Promise<{
  readonly summaryId: string;
  readonly executiveSummary: string;
  readonly citationIdByProvider: Readonly<Record<string, string>>;
  readonly citationProviders: string[];
}> {
  const request = unwrap(await new RequestSummaryUseCase(
    params.summaryJobs,
    params.summaryQueue,
    new AllowingSummaryQuota(),
    params.ids,
    params.clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    topicId: params.topicId,
    userId,
    subscriptionId,
    idempotencyKey: params.idempotencyKey,
    correlationId: runId,
  }), 'request summary');
  assert(request.created, 'summary request must create a new job');

  const execution = unwrap(await new ExecuteSummaryJobUseCase(
    params.summaryJobs,
    params.summaryArtifacts,
    params.summaryPolicies,
    new NoopUserSummaryPreferenceReader(),
    new FeedSummaryEvidenceSelector(params.feedItems, params.clock),
    new DeterministicSummaryModelAdapter(),
    params.summaryEvents,
    params.ids,
    params.clock,
    params.memory,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryJobId: request.summaryJobId,
    maxEvidenceItems: 4,
  }), 'execute summary');
  assert.equal(execution.status, 'completed');
  assert(execution.summaryId !== undefined, 'summary execution must produce summary id');

  const artifact = await params.summaryArtifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: execution.summaryId,
  });
  assert(artifact !== null, 'summary artifact must be persisted');
  const snapshot = artifact.toSnapshot();
  assert(params.summaryEvents.all().some((event) => event.eventType === 'summary.ready'));

  return {
    summaryId: snapshot.summaryId,
    executiveSummary: snapshot.executiveSummary,
    citationIdByProvider: Object.fromEntries(snapshot.citationMap.map((citation) => [
      citation.providerKey,
      citation.citationId,
    ])),
    citationProviders: snapshot.citationMap.map((citation) => citation.providerKey),
  };
}

function assertProviderCoverage(providers: readonly string[]): void {
  for (const provider of ['github', 'reddit', 'hacker-news', 'rss']) {
    assert(providers.includes(provider), `summary citations must include provider ${provider}`);
  }
}

function citationIdForProvider(
  citationIdByProvider: Readonly<Record<string, string>>,
  providerKey: string,
): string {
  const citationId = citationIdByProvider[providerKey];
  assert(citationId !== undefined, `summary citations must include ${providerKey} feedback target`);

  return citationId;
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    return ok({
      remaining: 999,
      resetAt: '2026-06-06T01:00:00.000Z',
    });
  }
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  generate(): string {
    const id = `${this.prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class MemoStackProductLoopBackend {
  readonly contextBodies: Record<string, unknown>[] = [];
  readonly captureBodies: Record<string, unknown>[] = [];
  readonly factBodies: Record<string, unknown>[] = [];

  readonly fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(input.toString()).pathname;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

    if (path.endsWith('/v1/context')) {
      this.contextBodies.push(body);
      return jsonResponse({
        data: {
          rendered_text: this.factBodies.length === 0
            ? ''
            : 'Prefer shorter summaries, prioritize GitHub security evidence, and down-rank low-signal Reddit provider evidence.',
          items: [],
          top_evidence: [],
          answer_support: {
            status: this.factBodies.length === 0 ? 'unsupported' : 'supported',
            items_returned: this.factBodies.length,
            warnings: [],
          },
          diagnostics: {
            provider: 'memo-stack-product-loop-fake',
            retrieval_sources_used: ['facts'],
            facts_used: this.factBodies.length,
          },
        },
      });
    }

    if (path.endsWith('/v1/captures')) {
      this.captureBodies.push(body);
      return jsonResponse({ data: { id: `capture-${this.captureBodies.length}` } });
    }

    if (path.endsWith('/v1/facts')) {
      this.factBodies.push(body);
      return jsonResponse({ data: { id: `fact-${this.factBodies.length}` } });
    }

    throw new Error(`Unexpected memo-stack product loop request ${path}`);
  };
}

class FixtureSourceFetcher implements SourceFetcherPort {
  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    const providerKey = asFixtureProviderKey(command.providerKey);
    return {
      items: [
        {
          externalId: `source-${runId}-${providerKey}`,
          canonicalUrl: `https://example.test/${providerKey}/${runId}`,
          title: fixtureTitle(providerKey),
          body: `${providerKey} fixture evidence for memory-backed summary e2e.`,
          authorHandle: `fixture-${providerKey}`,
          publishedAt: now,
        },
      ],
      nextCursor: `cursor-${providerKey}`,
    };
  }
}

class CapturingScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: ReportScanSucceededCommand[] = [];
  readonly failed: ReportScanFailedCommand[] = [];

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed.push(command);
  }
}

type ScanMetric = {
  readonly providerKey: FixtureProviderKey;
  readonly fetched: number;
  readonly inserted: number;
  readonly projected: number;
};

type PostgresEvidence = {
  readonly captures: number;
  readonly facts: number;
  readonly sourceTypes: readonly string[];
};

function asFixtureProviderKey(value: string): FixtureProviderKey {
  if (providerKeys.includes(value as FixtureProviderKey)) {
    return value as FixtureProviderKey;
  }

  throw new Error(`Unsupported fixture provider ${value}`);
}

function fixtureTitle(providerKey: FixtureProviderKey): string {
  return ({
    github: 'GitHub advisory highlights supply-chain auth hardening',
    reddit: 'Reddit operators discuss noisy monitoring alerts',
    'hacker-news': 'Hacker News thread compares incident response runbooks',
    rss: 'RSS vendor changelog ships queue reliability fix',
  })[providerKey];
}

function jsonResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function resolveProductLoopMode(env: NodeJS.ProcessEnv): ProductLoopMode {
  const value = readOptionalEnv('SUMMARY_MEMORY_PRODUCT_LOOP_MODE', env);
  if (value === undefined || value === 'fixture') {
    return 'fixture';
  }
  if (value === 'live') {
    return 'live';
  }

  throw new Error('SUMMARY_MEMORY_PRODUCT_LOOP_MODE must be fixture or live');
}

function assertProductLoopEvidenceRequirements(): void {
  if (requirePostgresEvidence && mode !== 'live') {
    throw new Error('SUMMARY_MEMORY_PRODUCT_LOOP_REQUIRE_POSTGRES=true requires SUMMARY_MEMORY_PRODUCT_LOOP_MODE=live');
  }
  if (
    requirePostgresEvidence &&
    readOptionalEnv('SUMMARY_MEMORY_PRODUCT_LOOP_POSTGRES_URL') === undefined
  ) {
    throw new Error('SUMMARY_MEMORY_PRODUCT_LOOP_POSTGRES_URL is required when SUMMARY_MEMORY_PRODUCT_LOOP_REQUIRE_POSTGRES=true');
  }
}

function requiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required for live summary memory product loop`);
  }

  return value;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }
  if (['1', 'true', 'yes'].includes(value.toLocaleLowerCase('en-US'))) {
    return true;
  }
  if (['0', 'false', 'no'].includes(value.toLocaleLowerCase('en-US'))) {
    return false;
  }

  throw new Error(`${name} must be true or false`);
}

function readOptionalEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function readPositiveIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

function unwrap<TValue, TError>(result: Result<TValue, TError>, label: string): TValue {
  if (result.ok) {
    return result.value;
  }

  throw result.error instanceof Error ? result.error : new Error(`${label} failed`);
}

void main();
