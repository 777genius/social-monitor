import { workspaceId } from '@social-monitor/shared-kernel';
import { SummaryArtifact, SummaryJob } from '../../domain';

import {
  summaryFixtureCommand, summaryFixtureCompletion, summaryFixtureJob, summaryFixtureNow, summaryFixtureUuid,
} from '../../../../test/support/summary-execution-outcome-fixture';
import { setupSummaryExecution } from '../../../../test/support/summary-execution-reliability-fixture';

describe('in-memory summary execution workflow', () => {
  it('fences a previous attempt even when a retry starts at the same timestamp', async () => {
    const d = await setupSummaryExecution();
    const first = await d.workflow.tryStart({ ...summaryFixtureCommand, startedAt: summaryFixtureNow });
    if (first === null) throw new Error('Expected claim');
    expect(await d.workflow.fail({ execution: first, failedAt: summaryFixtureNow, failureReason: 'fixture failure' })).toBe(true);
    const next = await d.workflow.tryStart({ ...summaryFixtureCommand, startedAt: summaryFixtureNow });
    if (next === null) throw new Error('Expected retry claim');
    expect(next.version).not.toBe(first.version);
    expect(next.job.toSnapshot().startedAt).toEqual(first.job.toSnapshot().startedAt);
    expect(await d.workflow.complete(summaryFixtureCompletion(first))).toBeNull();
    expect(await d.workflow.fail({ execution: first, failedAt: summaryFixtureNow, failureReason: 'late failure' })).toBe(false);
    expect((await d.listArtifacts()).items).toHaveLength(0);
    expect(d.events.all()).toHaveLength(0);
    expect((await d.workflow.complete(summaryFixtureCompletion(next)))?.toSnapshot().status).toBe('no_signal');
  });

  it('does not let an old completion overwrite an unrelated update to the running row', async () => {
    const d = await setupSummaryExecution();
    const execution = await d.workflow.tryStart({ ...summaryFixtureCommand, startedAt: summaryFixtureNow });
    if (execution === null) throw new Error('Expected claim');
    await d.jobs.save(execution.job);
    expect(await d.workflow.complete(summaryFixtureCompletion(execution))).toBeNull();
    expect((await d.listArtifacts()).items).toHaveLength(0);
    expect(d.events.all()).toHaveLength(0);
  });

  it('does not overwrite a terminal job with a late failure', async () => {
    const d = await setupSummaryExecution();
    const execution = await d.workflow.tryStart({ ...summaryFixtureCommand, startedAt: summaryFixtureNow });
    if (execution === null) throw new Error('Expected claim');
    await d.workflow.complete(summaryFixtureCompletion(execution));
    expect(await d.workflow.fail({ execution, failedAt: summaryFixtureNow, failureReason: 'late failure' })).toBe(false);
    expect((await d.readJob())?.toSnapshot().status).toBe('no_signal');
    expect(d.events.all()).toHaveLength(1);
  });

  it('rejects a mismatched artifact scope before changing any store', async () => {
    const d = await setupSummaryExecution();
    const execution = await d.workflow.tryStart({ ...summaryFixtureCommand, startedAt: summaryFixtureNow });
    if (execution === null) throw new Error('Expected claim');
    const completion = summaryFixtureCompletion(execution);
    await expect(d.workflow.complete({
      ...completion,
      artifact: SummaryArtifact.create({
        ...completion.artifact.toSnapshot(), workspaceId: workspaceId(summaryFixtureUuid(99)),
      }),
    })).rejects.toMatchObject({ code: 'operation.conflict' });
    expect((await d.readJob())?.toSnapshot().status).toBe('running');
    expect((await d.listArtifacts()).items).toHaveLength(0);
    expect(d.events.all()).toHaveLength(0);
  });

  it('rejects an artifact ID already owned by another terminal job without altering it', async () => {
    const d = await setupSummaryExecution();
    const first = await d.workflow.tryStart({ ...summaryFixtureCommand, startedAt: summaryFixtureNow });
    if (first === null) throw new Error('Expected first claim');
    const completed = summaryFixtureCompletion(first);
    await d.workflow.complete(completed);
    const otherId = summaryFixtureUuid(5);
    const otherScope = { ...summaryFixtureCommand, workspaceId: workspaceId(summaryFixtureUuid(99)), summaryJobId: otherId };
    await d.jobs.save(SummaryJob.request({ ...summaryFixtureJob(otherId).toSnapshot(), workspaceId: otherScope.workspaceId }));
    const other = await d.workflow.tryStart({ ...otherScope, startedAt: summaryFixtureNow });
    if (other === null) throw new Error('Expected other claim');
    await expect(d.workflow.complete(summaryFixtureCompletion(
      other, completed.artifact.toSnapshot().summaryId, summaryFixtureUuid(602),
    ))).rejects.toMatchObject({ code: 'operation.conflict' });
    expect((await d.jobs.findById(otherScope))?.toSnapshot().status).toBe('running');
    expect((await d.listArtifacts()).items[0]?.toSnapshot()).toEqual(completed.artifact.toSnapshot());
    expect(d.events.all()).toHaveLength(1);
  });

  it('does not leave an orphan artifact if the event identity already exists', async () => {
    const d = await setupSummaryExecution();
    const execution = await d.workflow.tryStart({ ...summaryFixtureCommand, startedAt: summaryFixtureNow });
    if (execution === null) throw new Error('Expected claim');
    const completion = summaryFixtureCompletion(execution);
    await d.events.publish(completion.event);
    await expect(d.workflow.complete(completion)).rejects.toMatchObject({ code: 'operation.conflict' });
    expect((await d.readJob())?.toSnapshot().status).toBe('running');
    expect((await d.listArtifacts()).items).toHaveLength(0);
    expect(d.events.all()).toHaveLength(1);
  });

  it('keeps a claim within its tenant and workspace', async () => {
    const d = await setupSummaryExecution();
    expect(await d.workflow.tryStart({
      ...summaryFixtureCommand, workspaceId: workspaceId(summaryFixtureUuid(99)), startedAt: summaryFixtureNow,
    })).toBeNull();
    expect((await d.readJob())?.toSnapshot().status).toBe('requested');
  });
});
