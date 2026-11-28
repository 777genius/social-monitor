import { causationId, correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SummaryArtifact, SummaryJob } from '@social-monitor/summary/domain';
import type { CompleteSummaryExecution, SummaryExecutionClaim } from '@social-monitor/summary/ports';

export const summaryFixtureUuid = (value: number): string =>
  '00000000-0000-4000-8000-' + String(value).padStart(12, '0');
export const summaryFixtureNow = new Date('2026-11-27T12:00:00.000Z');
export const summaryFixtureCommand = {
  tenantId: tenantId(summaryFixtureUuid(1)),
  workspaceId: workspaceId(summaryFixtureUuid(2)),
  summaryJobId: summaryFixtureUuid(4),
};
export const summaryFixtureJob = (id = summaryFixtureCommand.summaryJobId) => SummaryJob.request({
  id, tenantId: summaryFixtureCommand.tenantId, workspaceId: summaryFixtureCommand.workspaceId,
  interestId: summaryFixtureUuid(3), idempotencyKey: 'summary-execution:' + id,
  requestedAt: summaryFixtureNow,
});

export const summaryFixtureCompletion = (
  execution: SummaryExecutionClaim,
  summaryId = summaryFixtureUuid(501),
  readyEventId = summaryFixtureUuid(601),
): CompleteSummaryExecution => {
  const job = execution.job.toSnapshot();
  const artifact = SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1', summaryId,
    tenantId: job.tenantId, workspaceId: job.workspaceId, interestId: job.interestId,
    userId: job.userId, subscriptionId: job.subscriptionId,
    sourceWindow: {
      windowId: 'summary-execution-fixture', startedAt: new Date('2026-11-27T11:00:00.000Z'),
      endedAt: summaryFixtureNow, selectedFeedItemIds: [],
    },
    headline: 'No reliable signal yet',
    executiveSummary: 'No eligible evidence was selected for this fixture window.',
    keyPoints: [], sourceHighlights: [], citationMap: [],
    risksAndUnknowns: [{ description: 'Insufficient evidence.', reason: 'insufficient_evidence' }],
    qualityFlags: ['no_signal'],
    confidence: { level: 'none', score: 0, rationale: 'No evidence was selected.' },
    lineage: {
      promptVersion: 'summary.prompt.fixture.v1', schemaVersion: 'summary.artifact.v1',
      modelVersion: 'fixture', providerVersion: 'fixture', rulesVersion: 'summary.rules.fixture.v1',
      evalDatasetVersion: 'summary.eval.fixture.v1',
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    noSignalReason: 'No eligible evidence items selected.',
  });
  return {
    execution, artifact, completedAt: summaryFixtureNow,
    event: {
      eventId: eventId(readyEventId), eventType: 'summary.ready', schemaVersion: 1, occurredAt: summaryFixtureNow,
      tenantId: job.tenantId, workspaceId: job.workspaceId,
      correlationId: correlationId(job.id), causationId: causationId(job.id),
      payload: {
        summaryJobId: job.id, summaryId, tenantId: job.tenantId, workspaceId: job.workspaceId,
        interestId: job.interestId, userId: job.userId, subscriptionId: job.subscriptionId, status: 'no_signal',
      },
    },
  };
};
