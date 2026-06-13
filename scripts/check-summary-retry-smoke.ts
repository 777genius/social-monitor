import { DomainError, FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { EmptySummaryEvidenceSelector } from '../libs/summary/adapters/evidence/empty-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryEventPublisher } from '../libs/summary/adapters/messaging/in-memory-summary-event-publisher';
import { InMemorySummaryArtifactRepository } from '../libs/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '../libs/summary/adapters/persistence/in-memory-summary-job.repository';
import { SummaryJob } from '../libs/summary/domain';
import { ExecuteSummaryJobUseCase } from '../libs/summary/features/execute-summary-job/execute-summary-job.use-case';
import type {
  ProviderSummaryAttempt,
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelFailure,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelPort,
  SummaryModelRoute,
  SummaryModelValidationResult,
} from '../libs/summary/ports';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-retry-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FailOnceSummaryModel implements SummaryModelPort {
  private summarizeCallCount = 0;

  constructor(private readonly delegate: SummaryModelPort) {}

  route(input: SummaryModelInput, policy: SummaryModelPolicy, budget: SummaryModelBudget): SummaryModelRoute {
    return this.delegate.route(input, policy, budget);
  }

  estimate(input: SummaryModelInput, route: SummaryModelRoute): SummaryModelEstimate {
    return this.delegate.estimate(input, route);
  }

  async summarize(input: SummaryModelInput, route: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
    this.summarizeCallCount += 1;

    if (this.summarizeCallCount === 1) {
      throw new Error('Transient summary provider outage');
    }

    return this.delegate.summarize(input, route);
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(error: unknown): SummaryModelFailure {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Transient summary provider outage')) {
      return {
        kind: 'provider_unavailable',
        retryable: true,
        message,
      };
    }

    return this.delegate.classifyError(error);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  const tenant = tenantId('tenant-summary-retry-smoke');
  const workspace = workspaceId('workspace-summary-retry-smoke');
  const summaryJobs = new InMemorySummaryJobRepository();
  const artifacts = new InMemorySummaryArtifactRepository();
  const events = new InMemorySummaryEventPublisher();
  const jobId = 'summary-job-retry-smoke';

  await summaryJobs.save(SummaryJob.request({
    id: jobId,
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-summary-retry-smoke',
    idempotencyKey: 'summary-retry-smoke-request',
    requestedAt: new Date('2026-06-06T10:00:00.000Z'),
  }));

  const useCase = new ExecuteSummaryJobUseCase(
    summaryJobs,
    artifacts,
    new EmptySummaryEvidenceSelector(),
    new FailOnceSummaryModel(new DeterministicSummaryModelAdapter()),
    events,
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-06T10:01:00.000Z')),
  );

  const first = await useCase.execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryJobId: jobId,
  });

  if (first.ok) {
    throw new Error(`Expected first retry smoke execution to fail transiently, got ${JSON.stringify(first)}`);
  }

  if (!(first.error instanceof DomainError) || first.error.code !== 'external.dependency_unavailable') {
    throw new Error(`Expected first retry smoke execution to fail transiently, got ${JSON.stringify(first)}`);
  }

  const failedJob = await summaryJobs.findById({ tenantId: tenant, workspaceId: workspace, summaryJobId: jobId });
  if (failedJob?.toSnapshot().status !== 'failed') {
    throw new Error(`Expected failed job after first attempt, got ${JSON.stringify(failedJob?.toSnapshot())}`);
  }

  if (events.all().length !== 0) {
    throw new Error(`Expected no events after failed attempt, got ${events.all().length}`);
  }

  const second = await useCase.execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryJobId: jobId,
  });

  if (!second.ok || second.value.status !== 'no_signal' || second.value.summaryId === undefined) {
    throw new Error(`Expected retried job to complete as no_signal, got ${JSON.stringify(second)}`);
  }

  const completedJob = await summaryJobs.findById({ tenantId: tenant, workspaceId: workspace, summaryJobId: jobId });
  const completedSnapshot = completedJob?.toSnapshot();

  if (
    completedSnapshot?.status !== 'no_signal' ||
    completedSnapshot.failureReason !== undefined ||
    completedSnapshot.failedAt !== undefined
  ) {
    throw new Error(`Expected retry to clear failure state, got ${JSON.stringify(completedSnapshot)}`);
  }

  const artifact = await artifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: second.value.summaryId,
  });

  if (artifact === null) {
    throw new Error('Expected retried job to persist summary artifact');
  }

  if (events.all().length !== 1) {
    throw new Error(`Expected one summary.ready event after retry success, got ${events.all().length}`);
  }

  console.log('Summary retry smoke OK');
}
