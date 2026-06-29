import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { FeedItem } from '../libs/feed/domain';
import { InMemoryFeedItemReadRepository } from '../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { staticSummaryEvalFixtures } from '../libs/summary/adapters/eval/static-summary-eval.fixtures';
import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { FeedSummaryFreshnessProbe } from '../libs/summary/adapters/evidence/feed-summary-freshness.probe';
import { InMemorySummaryEventPublisher } from '../libs/summary/adapters/messaging/in-memory-summary-event-publisher';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryArtifactRepository } from '../libs/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '../libs/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '../libs/summary/adapters/persistence/in-memory-summary-policy.repository';
import { NoopUserSummaryPreferenceReader } from '../libs/summary/adapters/preferences/noop-user-summary-preference.reader';
import { SummaryJob } from '../libs/summary/domain';
import { EvaluateSummaryQualityUseCase } from '../libs/summary/features/evaluate-summary-quality/evaluate-summary-quality.use-case';
import { ExecuteSummaryJobUseCase } from '../libs/summary/features/execute-summary-job/execute-summary-job.use-case';
import { GetSummaryUseCase } from '../libs/summary/features/get-summary/get-summary.use-case';
import type { SummaryModelBudget, SummaryModelPolicy } from '../libs/summary/ports';
import { FixedClock, tenantId, workspaceId, type IdGenerator } from '@social-monitor/shared-kernel';

const outputPath = 'ops/evals/summary-quality-loop-output.json';
const update = process.argv.includes('--update');
const requiredFixtureGroups = [
  'empty_no_signal',
  'hn_golden',
  'prompt_injection',
  'secret_redaction',
  'citation_regression',
  'stale_marker',
] as const;

const policy: SummaryModelPolicy = {
  preferredProvider: 'deterministic-local',
  maxInputTokens: 12_000,
  maxOutputTokens: 1_500,
  maxEstimatedCostUsd: 0.5,
};
const budget: SummaryModelBudget = {
  remainingTokens: 20_000,
  remainingCostUsd: 1,
};

void main();

async function main(): Promise<void> {
  const evalProof = await buildEvalProof();
  const staleProof = await buildRuntimeStaleMarkerProof();
  const report = {
    schemaVersion: 1,
    checkId: 'summary-quality-loop-v1',
    generatedBy: 'npm run check:summary-quality-loop',
    evalOutputPath: 'ops/evals/summary-eval-output.json',
    blocksRelease: true,
    requiredGuarantees: [
      'schema-valid-summary-artifacts',
      'claims-grounded-in-cited-evidence',
      'real-citations-to-selected-evidence',
      'secret-like-output-blocked',
      'prompt-injection-output-blocked',
      'stale-marker-present-on-user-visible-summary',
    ],
    evalProof,
    runtimeProof: {
      staleMarker: staleProof,
    },
    blockingPassed: evalProof.blockingPassed && staleProof.blockingPassed,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error('Summary quality loop failed');
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing. Run npm run check:summary-quality-loop -- --update`);
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, 'utf8'));

  if (expected !== serialized) {
    throw new Error(`${outputPath} is stale. Run npm run check:summary-quality-loop -- --update`);
  }

  console.log(
    `Summary quality loop OK (${evalProof.fixtureCount} eval fixtures, stale summary ${staleProof.summaryId})`,
  );
}

async function buildEvalProof(): Promise<{
  readonly blockingPassed: boolean;
  readonly fixtureCount: number;
  readonly fixtureGroups: readonly string[];
  readonly missingFixtureGroups: readonly string[];
  readonly checkedKeyPointCount: number;
  readonly groundedKeyPointCount: number;
  readonly secretLeakCount: number;
  readonly staleFixtureIds: readonly string[];
}> {
  const result = await new EvaluateSummaryQualityUseCase(new DeterministicSummaryModelAdapter()).execute({
    fixtures: staticSummaryEvalFixtures,
    policy,
    budget,
  });
  const fixtureGroups = [...new Set(staticSummaryEvalFixtures.map((fixture) => fixture.group))].sort();
  const missingFixtureGroups = requiredFixtureGroups.filter((group) => !fixtureGroups.includes(group));
  const checkedKeyPointCount = result.fixtureResults.reduce(
    (total, fixture) => total + fixture.metrics.checkedKeyPointCount,
    0,
  );
  const groundedKeyPointCount = result.fixtureResults.reduce(
    (total, fixture) => total + fixture.metrics.groundedKeyPointCount,
    0,
  );
  const secretLeakCount = result.fixtureResults.reduce(
    (total, fixture) => total + fixture.metrics.secretLeakCount,
    0,
  );
  const staleFixtureIds = staticSummaryEvalFixtures
    .filter((fixture) => fixture.expectation.expectedFreshnessStatus === 'stale')
    .map((fixture) => fixture.fixtureId);

  return {
    blockingPassed:
      result.blockingPassed &&
      missingFixtureGroups.length === 0 &&
      checkedKeyPointCount === groundedKeyPointCount &&
      secretLeakCount === 0 &&
      staleFixtureIds.length > 0,
    fixtureCount: result.fixtureResults.length,
    fixtureGroups,
    missingFixtureGroups,
    checkedKeyPointCount,
    groundedKeyPointCount,
    secretLeakCount,
    staleFixtureIds,
  };
}

async function buildRuntimeStaleMarkerProof(): Promise<{
  readonly blockingPassed: boolean;
  readonly summaryId: string;
  readonly summaryStatus: string;
  readonly citationCount: number;
  readonly freshnessStatus: 'stale';
  readonly newestFeedItemId: string;
  readonly newestObservedAt: string;
  readonly eventCount: number;
}> {
  const tenant = tenantId('tenant-summary-quality-loop');
  const workspace = workspaceId('workspace-summary-quality-loop');
  const interestId = 'topic-summary-quality-loop';
  const feedItems = new InMemoryFeedItemReadRepository();
  const clock = new FixedClock(new Date('2026-06-06T00:05:00.000Z'));
  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const events = new InMemorySummaryEventPublisher();
  const summaryJobId = 'summary-quality-loop-job';

  feedItems.upsert(makeFeedItem({
    id: 'feed-quality-old',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    title: 'Original source evidence is selected',
    observedAt: new Date('2026-06-06T00:01:00.000Z'),
  }));
  await summaryJobs.save(SummaryJob.request({
    id: summaryJobId,
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    idempotencyKey: 'summary-quality-loop-key',
    requestedAt: clock.now(),
  }));

  const executeResult = await new ExecuteSummaryJobUseCase(
    summaryJobs,
    summaryArtifacts,
    new InMemorySummaryPolicyRepository(),
    new NoopUserSummaryPreferenceReader(),
    new FeedSummaryEvidenceSelector(feedItems, clock),
    new DeterministicSummaryModelAdapter(),
    events,
    new SequenceIdGenerator('summary-quality-artifact'),
    clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryJobId,
    maxEvidenceItems: 5,
  });

  if (!executeResult.ok) {
    throw new Error(executeResult.error.message);
  }

  assert(executeResult.value.summaryId !== undefined, 'summary job must create an artifact id');

  feedItems.upsert(makeFeedItem({
    id: 'feed-quality-new',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    title: 'Newer correction arrives after the source window',
    observedAt: new Date('2026-06-06T00:02:00.000Z'),
  }));

  const readResult = await new GetSummaryUseCase(
    summaryArtifacts,
    new FeedSummaryFreshnessProbe(feedItems, clock),
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: executeResult.value.summaryId,
  });

  if (!readResult.ok) {
    throw new Error(readResult.error.message);
  }
  assert(readResult.value.freshness.status === 'stale', 'summary read model must expose a stale marker');
  assert(readResult.value.citations.length > 0, 'summary read model must expose citations');
  assertNoSensitiveFragments(JSON.stringify(readResult.value));

  return {
    blockingPassed: true,
    summaryId: readResult.value.summaryId,
    summaryStatus: executeResult.value.status,
    citationCount: readResult.value.citations.length,
    freshnessStatus: readResult.value.freshness.status,
    newestFeedItemId: readResult.value.freshness.newestFeedItemId,
    newestObservedAt: readResult.value.freshness.newestObservedAt,
    eventCount: events.all().length,
  };
}

function makeFeedItem(params: {
  readonly id: string;
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly interestId: string;
  readonly title: string;
  readonly observedAt: Date;
}): FeedItem {
  return FeedItem.publish({
    id: params.id,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: params.interestId,
    sourceItemId: `${params.id}:source`,
    sourceBindingId: `${params.interestId}:binding`,
    providerKey: 'rss',
    canonicalUrl: `https://example.test/${params.id}`,
    title: params.title,
    bodyPreview: `Body for ${params.title}`,
    publishedAt: params.observedAt,
    observedAt: params.observedAt,
  });
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

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoSensitiveFragments(serialized: string): void {
  const forbidden = [
    'access_token',
    'refresh_token',
    'client_secret',
    'authorization',
    'cookie',
    'bearer ',
    'basic ',
  ];
  const normalized = serialized.toLowerCase();

  for (const fragment of forbidden) {
    if (normalized.includes(fragment)) {
      throw new Error(`Summary quality loop output leaked ${fragment}`);
    }
  }
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n');
}
