import { summaryFixtureCommand, summaryFixtureNow, summaryFixtureUuid } from '../../../../test/support/summary-execution-outcome-fixture';
import { setupSummaryExecution } from '../../../../test/support/summary-execution-reliability-fixture';

describe('summary execution reliability boundaries', () => {
  it('allows one model call when two deliveries race on the same requested job', async () => {
    const d = await setupSummaryExecution();
    const summarize = d.model.summarize.bind(d.model);
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered = (): void => undefined;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const calls = jest.spyOn(d.model, 'summarize').mockImplementationOnce(async (...args) => {
      entered(); await gate; return summarize(...args);
    });
    const first = d.useCase.execute(summaryFixtureCommand);
    await started;
    const second = await d.useCase.execute(summaryFixtureCommand);
    expect(second).toMatchObject({ ok: false, error: { code: 'operation.conflict' } });
    expect(calls).toHaveBeenCalledTimes(1);
    release();
    expect((await first).ok).toBe(true);
    expect((await d.listArtifacts()).items).toHaveLength(1);
    expect(d.events.all()).toHaveLength(1);
  });

  it('leaves unconfirmed finalization running and never re-enters the model', async () => {
    const d = await setupSummaryExecution();
    const summarize = jest.spyOn(d.model, 'summarize');
    const classify = jest.spyOn(d.model, 'classifyError');
    jest.spyOn(d.workflow, 'complete').mockRejectedValueOnce(new Error('transaction unavailable'));
    const first = await d.useCase.execute(summaryFixtureCommand);
    expect(first).toMatchObject({ ok: false, error: { details: { kind: 'summary.finalization_unconfirmed' } } });
    expect((await d.readJob())?.toSnapshot().status).toBe('running');
    expect((await d.listArtifacts()).items).toHaveLength(0);
    expect(d.events.all()).toHaveLength(0);
    expect(await d.useCase.execute(summaryFixtureCommand)).toMatchObject({
      ok: false, error: { code: 'operation.conflict' },
    });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(classify).not.toHaveBeenCalled();
  });

  it('keeps generated artifact identity and tenant scope authoritative over provider draft fields', async () => {
    const d = await setupSummaryExecution();
    const summarize = d.model.summarize.bind(d.model);
    jest.spyOn(d.model, 'summarize').mockImplementationOnce(async (...args) => {
      const attempt = await summarize(...args);
      return { ...attempt, draft: Object.assign({}, attempt.draft, {
        summaryId: summaryFixtureUuid(999), tenantId: summaryFixtureUuid(998), workspaceId: summaryFixtureUuid(997),
      }) };
    });
    const result = await d.useCase.execute(summaryFixtureCommand);
    expect(result).toMatchObject({ ok: true, value: { summaryId: summaryFixtureUuid(1_000) } });
    expect((await d.listArtifacts()).items[0]?.toSnapshot()).toMatchObject({
      tenantId: summaryFixtureCommand.tenantId, workspaceId: summaryFixtureCommand.workspaceId,
    });
  });

  it('does not expose storage SQL or private artifact data as a public failure', async () => {
    const d = await setupSummaryExecution();
    jest.spyOn(d.workflow, 'complete').mockRejectedValueOnce(
      new Error('Invalid Prisma invocation: INSERT summary_artifacts VALUES(private-evidence-fixture)'),
    );
    const result = await d.useCase.execute(summaryFixtureCommand);
    expect(result).toMatchObject({ ok: false, error: {
      message: 'Summary completion could not be confirmed', details: { kind: 'summary.finalization_unconfirmed' },
    } });
    expect(JSON.stringify(result)).not.toMatch(/Prisma|INSERT|private-evidence-fixture/);
    expect((await d.readJob())?.toSnapshot().status).toBe('running');
  });

  it('recognizes a committed artifact after losing the commit acknowledgement', async () => {
    const d = await setupSummaryExecution();
    const complete = d.workflow.complete.bind(d.workflow);
    const summarize = jest.spyOn(d.model, 'summarize');
    const classify = jest.spyOn(d.model, 'classifyError');
    jest.spyOn(d.workflow, 'complete').mockImplementationOnce(async (command) => {
      await complete(command);
      throw new Error('commit acknowledgement lost');
    });
    const first = await d.useCase.execute(summaryFixtureCommand);
    expect(first).toMatchObject({ ok: true, value: { status: 'no_signal' } });
    expect(await d.useCase.execute(summaryFixtureCommand)).toEqual(first);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(classify).not.toHaveBeenCalled();
    expect(d.events.all()).toHaveLength(1);
  });

  it('keeps a committed result intact when the acknowledgement reread also fails', async () => {
    const d = await setupSummaryExecution();
    const complete = d.workflow.complete.bind(d.workflow);
    const summarize = jest.spyOn(d.model, 'summarize');
    jest.spyOn(d.workflow, 'complete').mockImplementationOnce(async (command) => {
      await complete(command);
      jest.spyOn(d.jobs, 'findById').mockRejectedValueOnce(new Error('reread unavailable'));
      throw new Error('commit acknowledgement lost');
    });
    expect(await d.useCase.execute(summaryFixtureCommand)).toMatchObject({
      ok: false, error: { details: { kind: 'summary.finalization_unconfirmed' } },
    });
    expect((await d.readJob())?.toSnapshot().status).toBe('no_signal');
    expect((await d.useCase.execute(summaryFixtureCommand)).ok).toBe(true);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(d.events.all()).toHaveLength(1);
  });

  it('does not start the model after a lost claim acknowledgement', async () => {
    const d = await setupSummaryExecution();
    const start = d.workflow.tryStart.bind(d.workflow);
    const summarize = jest.spyOn(d.model, 'summarize');
    jest.spyOn(d.workflow, 'tryStart').mockImplementationOnce(async (command) => {
      await start(command);
      throw new Error('claim acknowledgement lost');
    });
    expect(await d.useCase.execute(summaryFixtureCommand)).toMatchObject({
      ok: false, error: { details: { kind: 'summary.claim_unconfirmed' } },
    });
    expect((await d.readJob())?.toSnapshot()).toMatchObject({ status: 'running', startedAt: summaryFixtureNow });
    expect((await d.useCase.execute(summaryFixtureCommand)).ok).toBe(false);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('keeps failure persistence separate from provider failure classification', async () => {
    const d = await setupSummaryExecution();
    jest.spyOn(d.model, 'summarize').mockRejectedValue(new Error('provider unavailable'));
    const classify = jest.spyOn(d.model, 'classifyError');
    jest.spyOn(d.workflow, 'fail').mockRejectedValueOnce(new Error('failure write unavailable'));
    expect(await d.useCase.execute(summaryFixtureCommand)).toMatchObject({
      ok: false, error: { details: { kind: 'summary.failure_unconfirmed' } },
    });
    expect(classify).toHaveBeenCalledTimes(1);
    expect((await d.readJob())?.toSnapshot().status).toBe('running');
    expect(d.events.all()).toHaveLength(0);
  });
});
