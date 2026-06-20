import {
  DomainError,
  FixedClock,
  type IdGenerator,
  tenantId,
  type TenantId,
  workspaceId,
  type WorkspaceId,
} from '@social-monitor/shared-kernel';

import { FakeSourceCatalogAdapter } from '../libs/monitoring/adapters/source-catalog/fake-source-catalog.adapter';
import { InMemoryIdempotencyAdapter } from '../libs/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../libs/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryTopicRepository } from '../libs/monitoring/adapters/persistence/in-memory-topic.repository';
import { BindSourceUseCase } from '../libs/monitoring/features/bind-source/bind-source.use-case';
import { CreateTopicUseCase } from '../libs/monitoring/features/create-topic/create-topic.use-case';
import type { SourceBindingConfig, SourceBindingConfigProtectorPort } from '../libs/monitoring/ports';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { FakeSourceProvider } from '../libs/ingestion/adapters/source/fake-source.provider';
import { selectRuntimeSourceProviders } from '../libs/ingestion/adapters/source/source-provider-runtime-scope';
import { SummaryArtifact } from '../libs/summary/domain';
import { InMemorySummaryArtifactRepository } from '../libs/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryFeedbackRepository } from '../libs/summary/adapters/persistence/in-memory-summary-feedback.repository';
import { RecordSummaryFeedbackUseCase } from '../libs/summary/features/record-summary-feedback/record-summary-feedback.use-case';

const tenant = tenantId('tenant-beta-scope-policy-smoke');
const workspace = workspaceId('workspace-beta-scope-policy-smoke');
const correlation = 'beta-scope-policy-correlation';
const clock = new FixedClock(new Date('2026-06-06T00:00:00.000Z'));

async function main(): Promise<void> {
  const ids = new SequenceIdGenerator('beta-policy');
  proveFixtureProvidersStayOutOfBetaRuntimeRegistry();
  await proveUnsupportedSourceProfilesStayOutOfBindingCatalog();
  await proveUnsupportedBindingsAreRejected(ids);
  await proveUnsupportedSourceDemandIsCapturedAsFeedback(ids);

  console.log('Beta scope source policy smoke OK');
}

function proveFixtureProvidersStayOutOfBetaRuntimeRegistry(): void {
  const localProviders = selectRuntimeSourceProviders([new FakeSourceProvider()], {
    SOCIAL_MONITOR_RUNTIME_PROFILE: 'local-dev',
  });
  const betaProviders = selectRuntimeSourceProviders([new FakeSourceProvider()], {
    SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
  });

  assert(localProviders.length === 1, 'fake-source must stay available for local deterministic runtime');
  assert(betaProviders.length === 0, 'fake-source must not be registered in beta runtime');
}

async function proveUnsupportedSourceProfilesStayOutOfBindingCatalog(): Promise<void> {
  const sourceCatalog = new FakeSourceCatalogAdapter({ includeFixtureProviders: false });
  const unsupportedProfiles = sourceReadinessProfiles.filter((profile) => profile.state !== 'enabled_beta');

  assert(unsupportedProfiles.length > 0, 'source readiness profiles must include deferred providers');

  for (const profile of unsupportedProfiles) {
    const capability = await sourceCatalog.getCapability(profile.providerKey);
    assert(
      capability === null,
      `${profile.providerKey} must not be available for beta binding while readiness state is ${profile.state}`,
    );
  }

  const localFixtureCatalog = new FakeSourceCatalogAdapter();
  assert(
    (await localFixtureCatalog.getCapability('fake-source')) !== null,
    'fake-source must remain available for deterministic local certification',
  );
}

async function proveUnsupportedBindingsAreRejected(ids: IdGenerator): Promise<void> {
  const topics = new InMemoryTopicRepository();
  const outbox = new InMemoryOutboxAdapter();
  const idempotency = new InMemoryIdempotencyAdapter();
  const createdTopic = await new CreateTopicUseCase(topics, outbox, idempotency, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    name: 'Unsupported Source Demand',
    query: 'twitter reddit telegram',
    idempotencyKey: 'topic:create:unsupported-source-demand',
    correlationId: correlation,
  });
  assert(createdTopic.ok, 'topic creation should succeed before policy checks');

  const bindSource = new BindSourceUseCase(
    topics,
    new InMemorySourceBindingRepository(),
    new FakeSourceCatalogAdapter({ includeFixtureProviders: false }),
    outbox,
    idempotency,
    new PassThroughConfigProtector(),
    ids,
    clock,
  );
  const unsupportedProfiles = sourceReadinessProfiles.filter((profile) => profile.state !== 'enabled_beta');

  for (const profile of unsupportedProfiles) {
    const result = await bindSource.execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: createdTopic.value.topicId,
      providerKey: profile.providerKey,
      config: {
        mode: 'search',
        query: profile.providerKey,
      },
      idempotencyKey: `source:bind:${profile.providerKey}`,
      correlationId: correlation,
    });

    assert(!result.ok, `${profile.providerKey} binding should be rejected`);
    assert(result.error instanceof DomainError, `${profile.providerKey} should return a DomainError`);
    assert(result.error.code === 'validation.failed', `${profile.providerKey} should fail through policy validation`);
  }
}

async function proveUnsupportedSourceDemandIsCapturedAsFeedback(ids: IdGenerator): Promise<void> {
  const summaries = new InMemorySummaryArtifactRepository();
  const feedback = new InMemorySummaryFeedbackRepository();
  await summaries.save(makeSummary({ tenantId: tenant, workspaceId: workspace }));

  const result = await new RecordSummaryFeedbackUseCase(summaries, feedback, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: 'summary-beta-policy',
    idempotencyKey: 'feedback:source-request:x-twitter',
    submittedBy: 'beta-user-1',
    rating: 3,
    category: 'source_request',
    comment: 'User requested X/Twitter monitoring; keep as source roadmap evidence, not beta binding.',
    correlationId: correlation,
  });

  assert(result.ok, 'source request feedback should be captured');
  assert(result.value.triageOwner === 'source-owner', 'source request feedback must route to source owner');
  assert(!result.value.eligibleForEvalFixture, 'source request feedback must not enter summary eval fixtures');
  assert(feedback.all().length === 1, 'source request feedback should be stored once');
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

class PassThroughConfigProtector implements SourceBindingConfigProtectorPort {
  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }

  async unprotect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }
}

const makeSummary = (params: {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId: 'summary-beta-policy',
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    topicId: 'topic-beta-policy',
    sourceWindow: {
      windowId: 'window-beta-policy',
      startedAt: new Date('2026-06-06T00:00:00.000Z'),
      endedAt: new Date('2026-06-06T00:01:00.000Z'),
      selectedFeedItemIds: [],
    },
    headline: 'No reliable signal yet',
    executiveSummary: 'No eligible evidence items were available.',
    keyPoints: [],
    risksAndUnknowns: [{ description: 'Insufficient evidence.', reason: 'insufficient_evidence' }],
    sourceHighlights: [],
    citationMap: [],
    qualityFlags: ['no_signal'],
    confidence: {
      level: 'none',
      score: 0,
      rationale: 'No evidence was selected for this topic window.',
    },
    lineage: {
      promptVersion: 'prompt-v1',
      schemaVersion: 'summary.artifact.v1',
      modelVersion: 'model-v1',
      providerVersion: 'provider-v1',
      rulesVersion: 'rules-v1',
      evalDatasetVersion: 'eval-v1',
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
    noSignalReason: 'No eligible evidence items selected for this topic.',
  });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
