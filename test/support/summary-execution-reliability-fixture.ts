import { FixedClock } from '@social-monitor/shared-kernel';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { DeterministicSummaryModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryExecutionWorkflow } from '@social-monitor/summary/adapters/persistence/in-memory-summary-execution-workflow';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { summaryFixtureCommand, summaryFixtureJob, summaryFixtureNow, summaryFixtureUuid } from './summary-execution-outcome-fixture';

export const setupSummaryExecution = async () => {
  const jobs = new InMemorySummaryJobRepository();
  const artifacts = new InMemorySummaryArtifactRepository();
  const events = new InMemorySummaryEventPublisher();
  const workflow = new InMemorySummaryExecutionWorkflow(jobs, artifacts, events);
  const model = new DeterministicSummaryModelAdapter();
  const clock = new FixedClock(summaryFixtureNow);
  let nextId = 1_000;
  await jobs.save(summaryFixtureJob());
  const useCase = new ExecuteSummaryJobUseCase(
    jobs, artifacts, new InMemorySummaryPolicyRepository(),
    { findEffectivePreference: async () => null },
    { select: async () => ({
      sourceWindow: { windowId: 'fixture-window', startedAt: new Date('2026-11-27T11:00:00.000Z'),
        endedAt: summaryFixtureNow, selectedFeedItemIds: [] },
      items: [],
    }) },
    model, workflow, { generate: () => summaryFixtureUuid(nextId++) }, clock,
  );
  const readJob = () => jobs.findById(summaryFixtureCommand);
  const listArtifacts = () => artifacts.list({ ...summaryFixtureCommand, limit: 100 });
  return { jobs, artifacts, events, workflow, model, clock, useCase, readJob, listArtifacts };
};
