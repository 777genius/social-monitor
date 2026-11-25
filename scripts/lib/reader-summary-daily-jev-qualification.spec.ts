import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { PrismaReaderValueInventory } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory';
import { PrismaReaderValueExistingAssessment } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-existing-assessment';
import { readerValueScoringConfiguration } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config';
import { fixtureSource } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder.spec-support';
import { createDailyJevCaptureQualification } from './reader-summary-daily-jev-qualification';

afterEach(() => { jest.restoreAllMocks(); });

it.each(['openrouter-systemone', 'openai-decisions'] as const)(
  'daily qualification searches only the selected %s assessment identity without credentials', async (scoringProvider) => {
    const source = { ...fixtureSource, tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace'),
      title: 'Compiler release', body: 'Measured improvements to compilers.', interest: 'compilers',
      availableAt: '2026-09-20T00:00:00Z' };
    jest.spyOn(PrismaReaderValueInventory.prototype, 'page').mockResolvedValue([{
      cursor: { publishedAt: '2026-09-20T00:00:00Z', feedItemId: 'feed' }, source,
      sourceBindingId: 'binding', observedAt: '2026-09-20T00:00:00Z', sourceRevisionKey: 'revision',
      sourceUpdatedAt: '2026-09-20T00:00:00Z', metadata: { kind: 'rss_item' },
    }]);
    const find = jest.spyOn(PrismaReaderValueExistingAssessment.prototype, 'find').mockResolvedValue(null);
    const qualification = createDailyJevCaptureQualification({ fresh: true, mode: 'jev_primary_v3',
      scoringProvider, client: {}, clock: { now: () => new Date('2026-09-21T00:00:01Z') },
      interests: { readCurrent: async () => ({ kind: 'available', interest: { ...source, query: 'compilers' } }) } });
    if (!qualification.selector) throw new Error('Qualification missing');
    const cutoff = new Date('2026-09-21T00:00:00Z');
    const result = await qualification.selector.qualify({ tenantId: source.tenantId, workspaceId: source.workspaceId,
      scope: { type: 'workspace' }, period: { cadence: 'daily', startedAt: new Date('2026-09-20T00:00:00Z'),
        endedAt: cutoff, timezone: 'UTC', periodKey: 'daily:test' }, observedThrough: cutoff, maxItems: 10 }, [{
      feedItemId: 'feed', sourceItemId: source.sourceItemId, sourceBindingId: 'binding',
      interestId: source.interestId, providerKey: source.providerKey, canonicalUrl: source.canonicalUrl,
      title: source.title, sourceText: source.body, bodyPreview: source.body, score: 1, whyImportant: [],
      publishedAt: new Date('2026-09-20T00:00:00Z'), observedAt: new Date('2026-09-20T00:00:00Z'),
    }]);
    expect(result.items).toEqual([]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0]?.[0]).toMatchObject(readerValueScoringConfiguration(scoringProvider));
    expect(qualification.audit()?.candidates).toEqual([{ feedItemId: 'feed', admitted: false }]);
  });
