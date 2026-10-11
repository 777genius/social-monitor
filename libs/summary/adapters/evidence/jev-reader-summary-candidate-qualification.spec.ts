import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ReaderValueAssessment } from '@social-monitor/relevance/application/contracts/reader-value-assessment-store';
import type { ReaderValueInventoryItem } from '@social-monitor/relevance/application/contracts/reader-value-inventory';
import { validateReaderValueAnswers, readerValueLabels } from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';
import { SourceContentSafetyPolicy } from '@social-monitor/relevance/domain/source-content-safety';
import { ConservativeReaderValueInputBuilder } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder';
import type { SummaryEvidenceItem } from '../../domain';
import { JevReaderSummaryCandidateQualification } from './jev-reader-summary-candidate-qualification';

const tenant = tenantId('11111111-1111-4111-8111-111111111111');
const workspace = workspaceId('22222222-2222-4222-8222-222222222222');
const startedAt = new Date('2026-10-11T00:00:00Z');
const endedAt = new Date('2026-10-12T00:00:00Z');
const cutoff = new Date('2026-10-11T16:03:00Z');
const params = { tenantId: tenant, workspaceId: workspace, scope: { type: 'workspace' as const },
  period: { startedAt, endedAt, timezone: 'UTC', periodKey: 'daily:test' }, maxItems: 20,
  observedThrough: cutoff };

function fixture() {
  const entry: ReaderValueInventoryItem = {
    cursor: { publishedAt: '2026-10-11T12:00:00.000000Z', feedItemId: 'feed-one' },
    sourceBindingId: 'binding-one', observedAt: '2026-10-11T12:01:00.000000Z',
    sourceUpdatedAt: '2026-10-11T12:01:00.000000Z', sourceRevisionKey: 'content-revision',
    metadata: { kind: 'rss_item' }, source: { tenantId: tenant, workspaceId: workspace,
      interestId: 'interest-one', sourceItemId: 'source-one', providerKey: 'rss',
      canonicalUrl: 'https://example.org/article', title: 'A relevant compiler release',
      body: 'A compiler release improves build times and includes a reproducible example.',
      interest: 'compilers', availableAt: '2026-10-11T12:01:00.000000Z',
      capture: { representationVersion: 'test.v1', availability: 'complete', segments: [] } },
  };
  const item: SummaryEvidenceItem = { feedItemId: entry.cursor.feedItemId,
    sourceItemId: entry.source.sourceItemId, sourceBindingId: entry.sourceBindingId,
    interestId: entry.source.interestId, providerKey: 'rss', canonicalUrl: entry.source.canonicalUrl,
    title: entry.source.title, bodyPreview: entry.source.body, sourceText: entry.source.body, score: 10, whyImportant: [],
    publishedAt: new Date(entry.cursor.publishedAt), observedAt: new Date(entry.observedAt) };
  return { entry, item };
}

function answers(useful = true, relevant = true) {
  const value = Object.fromEntries(Object.entries(readerValueLabels).map(([criterion, labels]) => {
    const choice = criterion === 'usefulness' ? (useful ? 'useful' : 'noise')
      : criterion === 'relevance' ? (relevant ? 'relevant' : 'unrelated') : labels[0]!;
    return [criterion, { choice, confidence: 1,
      probabilities: Object.fromEntries(labels.map((label) => [label, label === choice ? 1 : 0])) }];
  }));
  const parsed = validateReaderValueAnswers(value);
  if (!parsed.ok) throw new Error('Invalid test answers');
  return parsed.value;
}

function setup(change?: (entry: ReaderValueInventoryItem) => ReaderValueInventoryItem,
  state: 'ready' | 'missing' | 'late' | 'irrelevant' = 'ready') {
  const { item, entry: original } = fixture();
  const entry = change?.(original) ?? original;
  const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
  const find = jest.fn(async (input: import('@social-monitor/relevance/application/contracts/reader-value-assessment-store').ReaderValuePreparedInput): Promise<ReaderValueAssessment | null> => state === 'missing' ? null : ({
    id: 'assessment-one', input, state: 'assessed', attempts: 1, leaseToken: null, leaseUntil: null,
    assessedAt: state === 'late' ? '2026-10-11T16:15:00.000001Z' : '2026-10-11T16:05:00.000000Z',
    answers: answers(true, state !== 'irrelevant'), usageUnknown: false, costUsd: null, errorCode: null,
  }));
  const page = jest.fn(async () => [entry]);
  const readCurrent = jest.fn(async () => ({ kind: 'available' as const,
    interest: { tenantId: tenant, workspaceId: workspace, interestId: 'interest-one', query: 'compilers' } }));
  const observe = jest.fn();
  const qualifier = new JevReaderSummaryCandidateQualification({ page }, builder, { find },
    { readCurrent }, { now: () => new Date("2026-10-11T16:15:00Z") },
    new SourceContentSafetyPolicy(), observe);
  return { qualifier, item, find, page, readCurrent, observe };
}

describe('Jev capture qualification', () => {
  it('admits an exact current useful/relevant assessment with metadata-only audit and zero generation', async () => {
    const f = setup(); const result = await f.qualifier.qualify(params, [f.item]);
    expect(result.items).toEqual([f.item]);
    expect(result.audit.candidates[0]).toMatchObject({ admitted: true, assessmentId: 'assessment-one' });
    expect(result.audit.candidates[0]?.inputSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result.audit)).not.toContain(f.item.title);
    expect(f.find).toHaveBeenCalledTimes(1);
    expect(result.audit.cutoffAt).toBe('2026-10-11T16:03:00.000Z');
    expect(result.audit.assessmentCutoffAt).toBe('2026-10-11T16:15:00.000Z');
    expect(result.audit.candidates[0]?.assessedAt).toBe('2026-10-11T16:05:00.000000Z');
  });
  it.each(['missing', 'late', 'irrelevant'] as const)('excludes %s instead of falling back to legacy qualification', async (state) => {
    const f = setup(undefined, state); expect((await f.qualifier.qualify(params, [f.item])).items).toEqual([]);
  });
  it.each([
    (entry: ReaderValueInventoryItem) => ({ ...entry, source: { ...entry.source, tenantId: 'foreign' } }),
    (entry: ReaderValueInventoryItem) => ({ ...entry, source: { ...entry.source, interest: 'changed' } }),
    (entry: ReaderValueInventoryItem) => ({ ...entry, sourceUpdatedAt: '2026-10-11T16:03:00.000001Z' }),
    (entry: ReaderValueInventoryItem) => ({ ...entry, observedAt: '2026-10-11T16:03:00.000001Z' }),
    (entry: ReaderValueInventoryItem) => ({ ...entry, cursor: { ...entry.cursor, publishedAt: '2026-10-12T00:00:00.000000Z' } }),
  ])('rejects scope/source/cutoff substitutions before lookup', async (change) => {
    const f = setup(change); expect((await f.qualifier.qualify(params, [f.item])).items).toEqual([]);
    expect(f.find).not.toHaveBeenCalled();
  });
  it('fails if current interest changes during qualification', async () => {
    const f = setup(); f.readCurrent.mockResolvedValueOnce({ kind: 'available', interest: {
      tenantId: tenant, workspaceId: workspace, interestId: 'interest-one', query: 'compilers' } })
      .mockResolvedValueOnce({ kind: 'available', interest: { tenantId: tenant,
        workspaceId: workspace, interestId: 'interest-one', query: 'changed' } });
    await expect(f.qualifier.qualify(params, [f.item])).rejects.toThrow('changed');
  });
  it.each(['title', 'bodyPreview', 'sourceText'] as const)('rejects old reader-visible %s despite matching source IDs', async (key) => {
    const f = setup(); expect((await f.qualifier.qualify(params, [{ ...f.item, [key]: 'old revision' }])).items).toEqual([]);
    expect(f.find).not.toHaveBeenCalled();
  });
  it.each(['rss', 'hacker-news'])('admits normal long %s promotion source text beyond persisted preview limits', async (providerKey) => {
    const body = 'A compiler release provides reproducible build improvements. '.repeat(100);
    const f = setup((entry) => ({ ...entry,
      metadata: { kind: providerKey === 'rss' ? 'rss_item' : 'hacker_news_story' },
      source: { ...entry.source, providerKey, body } }));
    const item = { ...f.item, providerKey, sourceText: body.trim(), bodyPreview: body.trim() };
    expect((await f.qualifier.qualify(params, [item])).items).toEqual([item]);
    expect(f.find).toHaveBeenCalledTimes(1);
    expect((await f.qualifier.qualify(params, [{ ...item, bodyPreview: body.slice(0, 320) }])).items).toEqual([]);
  });
  it('rejects prefix-only body binding', async () => {
    const f = setup(); const prefix = f.item.sourceText!.slice(0, 20);
    expect((await f.qualifier.qualify(params, [{ ...f.item, sourceText: prefix, bodyPreview: prefix }])).items).toEqual([]);
    expect(f.find).not.toHaveBeenCalled();
  });
  it('requires an explicit cutoff', async () => {
    const f = setup(); await expect(f.qualifier.qualify({ ...params, observedThrough: undefined }, [f.item]))
      .rejects.toThrow('explicit cutoff');
  });
});
