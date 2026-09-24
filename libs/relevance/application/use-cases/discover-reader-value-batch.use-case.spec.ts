import { err, ok } from '@social-monitor/shared-kernel';
import type { ReaderValueInputBuilder, ReaderValueInventory, ReaderValueInventoryItem } from '../contracts/reader-value-inventory';
import type { ReaderValueAssessmentStore } from '../contracts/reader-value-assessment-store';
import { DiscoverReaderValueBatchUseCase } from './discover-reader-value-batch.use-case';
import { assessmentClaim } from './assess-reader-value-batch.spec-support';

const scope = { tenantId: 'tenant', workspaceId: 'workspace', interestId: 'interest' };
const command = { scopes: [scope], backfillFrom: '2026-09-01T00:00:00Z' };
function item(id: number, workspaceId = scope.workspaceId): ReaderValueInventoryItem {
  return {
    cursor: { publishedAt: '2026-09-10T00:00:00.123456Z', feedItemId: String(id) },
    sourceBindingId: `binding-${id}`,
    observedAt: '2026-09-10T00:00:01.123456Z',
    sourceUpdatedAt: '2026-09-10T00:00:00.123456Z',
    sourceRevisionKey: 'revision', metadata: { kind: 'rss_item' },
    source: { ...scope, workspaceId, interestId: 'interest', sourceItemId: String(id), providerKey: 'rss',
      canonicalUrl: 'https://example.test/article', title: 'Measured method', body: 'Full native text',
      interest: 'Methods', capture: { availability: 'unknown', representationVersion: 'legacy.v1', segments: [] },
      availableAt: null },
  };
}
function setup(rows: ReaderValueInventoryItem[]) {
  const page = jest.fn<ReturnType<ReaderValueInventory['page']>, Parameters<ReaderValueInventory['page']>>(async (pageScope, _from, cursor, limit) => {
    const offset = cursor ? rows.findIndex((row) => row.cursor.feedItemId === cursor.feedItemId) + 1 : 0;
    return rows.slice(offset, offset + limit).map((row) => ({ ...row, source: { ...row.source, ...pageScope } }));
  });
  const prepare = jest.fn<ReturnType<ReaderValueInputBuilder['prepare']>, Parameters<ReaderValueInputBuilder['prepare']>>(() => ok(assessmentClaim().input));
  const ensure = jest.fn<ReturnType<ReaderValueAssessmentStore['ensure']>, Parameters<ReaderValueAssessmentStore['ensure']>>(
    async () => ({ ...assessmentClaim(), state: 'assessed' as const }));
  const now = jest.fn(() => new Date('2026-09-20T00:00:00Z'));
  const create = () => new DiscoverReaderValueBatchUseCase({ page }, { prepare }, { ensure }, { generate: () => 'id' }, { now });
  return { page, prepare, ensure, create, now, useCase: create() };
}

describe('bounded reader-value discovery sweep', () => {
  it('resumes past the global limit and revisits edited old rows after completing the sweep', async () => {
    const rows = Array.from({ length: 126 }, (_, index) => item(index));
    const fixture = setup(rows);
    expect(await fixture.useCase.execute(command)).toMatchObject({ ok: true, value: { discovered: 100 } });
    expect(fixture.page.mock.calls.map((call) => call[3])).toEqual([25, 25, 25, 25]);
    rows[0] = { ...rows[0]!, source: { ...rows[0]!.source, body: 'No improvement: revised old source' } };
    fixture.now.mockReturnValue(new Date('2026-09-20T00:00:12Z'));
    expect(await fixture.useCase.execute(command)).toMatchObject({ ok: true, value: { discovered: 26, completedSweeps: 1, sweepDurationMs: 12000 } });
    fixture.prepare.mockClear();
    await fixture.useCase.execute(command);
    expect(fixture.prepare.mock.calls[0]).toEqual([rows[0]!.source, 'revision']);
  });

  it('restart replays discovery into durable exact keys without a scoring call', async () => {
    const fixture = setup([item(1)]);
    expect(await fixture.useCase.execute(command)).toMatchObject({ value: { assessedCacheHits: 1 } });
    expect(await fixture.create().execute(command)).toMatchObject({ value: { assessedCacheHits: 1 } });
    expect(fixture.ensure).toHaveBeenCalledTimes(2);
    expect(fixture.ensure.mock.calls[0]).toEqual(fixture.ensure.mock.calls[1]);
  });

  it('never advances a failed persistence row; a subsequent tick retries it', async () => {
    const fixture = setup([item(1), item(2), item(3)]);
    fixture.ensure.mockResolvedValueOnce({ ...assessmentClaim(), state: 'assessed' }).mockRejectedValueOnce(new Error('DB unavailable'));
    expect(await fixture.useCase.execute(command)).toMatchObject({ ...err('persistence_unavailable'), diagnostics: { discovered: 1, assessedCacheHits: 1 } });
    fixture.prepare.mockClear();
    await fixture.useCase.execute(command);
    expect(fixture.prepare.mock.calls[0]).toEqual([item(2).source, 'revision']);
  });

  it('rejects unknown kinds explicitly and continues rather than filling the page with failed work', async () => {
    const rows = [{ ...item(1), metadata: { kind: 'rss_comment' } }, item(2)];
    const fixture = setup(rows);
    expect(await fixture.useCase.execute(command)).toMatchObject({ value: { discovered: 2, unsupportedKind: 1, retained: 1 } });
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
  });

  it('visits at most 25 rows per scope before rotating and remembers the next scope across ticks', async () => {
    const fixture = setup(Array.from({ length: 100 }, (_, index) => item(index)));
    const scopes = Array.from({ length: 5 }, (_, index) => ({ ...scope, workspaceId: String(index) }));
    await fixture.useCase.execute({ ...command, scopes });
    expect(fixture.page.mock.calls.map((call) => call[0].workspaceId)).toEqual(['0', '1', '2', '3']);
    fixture.page.mockClear();
    await fixture.useCase.execute({ ...command, scopes });
    expect(fixture.page.mock.calls[0]?.[0].workspaceId).toBe('4');
  });

  it('rejects invalid windows before inventory access', async () => {
    const fixture = setup([]);
    expect(await fixture.useCase.execute({ ...command, backfillFrom: 'invalid' })).toEqual(err('configuration_invalid'));
    expect(fixture.page).not.toHaveBeenCalled();
  });
});
