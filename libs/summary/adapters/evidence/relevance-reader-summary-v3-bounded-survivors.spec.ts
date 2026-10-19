import { serializeReaderSummaryArtifact } from '../persistence/prisma/prisma-reader-summary-json';
import { normalizeReaderSummaryArtifactPayload } from '../persistence/prisma/prisma-reader-summary-artifact-payload';
import { readerSummaryArtifactViewFromReaderSummaryView } from '../../interfaces/rest/reader-summary-rest.mapper';
import { ReaderSummaryArtifact } from '../../domain';
import { readerSummaryV3PromotionFindings } from '../../domain/policies/reader-summary-v3-publication';
import { artifact as baselineArtifact } from '../../domain/policies/reader-summary-publication-policy-test-fixtures';
import { buildReaderSummaryDraftWithPromotionContent } from '../../features/execute-reader-summary-job/reader-summary-promotion-content';
import { buildReaderSummaryPromotionArtifactFields } from '../../features/execute-reader-summary-job/reader-summary-promotion-artifact-fields';
import { presentReaderSummaryArtifact } from '../../features/shared/reader-summary-artifact-presenter';
import { candidate, id, TestPresentation, workspaceSetup } from './relevance-reader-summary-v3-promotion.fixture';

function setup(survivors = 9, mergeFirstThree = false) {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    ...candidate(index + 1, 'important', 'central'), provider: index < 8 ? 'reddit' : index === 8 ? 'x-twitter' : 'hacker-news',
    publishedAt: '2026-09-20T12:00:00.000001Z', observedAt: '2026-09-20T12:01:00.000001Z',
    title: `Independent event ${index}`, body: `Independent observed event ${index} with exact source evidence.`,
    ...(mergeFirstThree && index < 3 ? { storyId: 'same-explicit-story' } : {}),
  }));
  const rejected = new Set(rows.slice(survivors).map(row => row.id));
  const tracked = new TestPresentation(rejected);
  const fixture = workspaceSetup(rows, undefined, { build: async inputs =>
    (await tracked.build(inputs)).map(result => result.status === 'unavailable'
      ? { status: 'unavailable', reason: 'invalid_presentation' } : result) });
  return { ...fixture, tracked, rejected };
}

describe('explicit bounded V3 presentation survivors', () => {
  it('freezes nine sealed stories as seven Top and two Additional and discloses limited coverage in the public artifact', async () => {
    const fixture = setup(), result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe('ready');
    expect(fixture.tracked.attempted).toBe(32);
    if (result.kind !== 'ready') throw new Error(result.kind);
    const evidence = result.evidence, selection = evidence.promotionV3!;
    expect(selection.presentationCoverageLimited).toBe(true);
    expect(selection.top).toHaveLength(7);
    expect(selection.additional).toHaveLength(2);
    expect(selection.excluded.some(item => item.reason === 'presentation_budget_exhausted')).toBe(true);
    expect(selection.excluded.some(item => item.reason === 'presentation_unavailable')).toBe(true);
    const selected = [...selection.top, ...selection.additional];
    expect(selected.map(item => item.candidateId)).toEqual([1, 2, 3, 4, 5, 6, 9, 7, 8].map(id));
    expect(selected.every(item => item.presentation.status === 'available' && !fixture.rejected.has(item.candidateId))).toBe(true);
    const original = baselineArtifact().toSnapshot();
    const citationMap = evidence.selectedEvidence.map((item, index) => ({ citationId: `c${index + 1}`,
      feedItemId: item.feedItemId, sourceItemId: item.sourceItemId, providerKey: item.providerKey,
      field: 'title' as const, canonicalUrl: item.canonicalUrl }));
    const topStories = evidence.clusters.map((cluster, index) => ({ storyClusterId: cluster.id,
      title: `Observed method ${index}`, summary: `The source documents independently observed method ${index}.`,
      interestIds: cluster.interestIds, providerKeys: cluster.providerKeys,
      citationIds: [citationMap.find(c => c.feedItemId === cluster.representativeFeedItemId)!.citationId] }));
    const modelDraft = { ...original, citationMap, topStories, qualityFlags: [], noSignalReason: undefined,
      content: { ...original.content!, narrativeSections: [{ id: 'lead', kind: 'lead' as const,
        title: 'Independent method observations', text: 'Independent method observations from two providers.',
        citationIds: ['c1', 'c9'] }] } };
    const draft = buildReaderSummaryDraftWithPromotionContent(evidence, modelDraft);
    const snapshot = fixture.job.toSnapshot();
    const artifact = ReaderSummaryArtifact.create({ ...original, ...draft,
      tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId, scope: snapshot.scope, period: snapshot.period,
      sourceWindow: evidence.sourceWindow, storyClusters: evidence.clusters,
      ...buildReaderSummaryPromotionArtifactFields({ artifactId: original.readerSummaryId, modelEvidence: evidence, draft }) });
    expect(readerSummaryV3PromotionFindings(artifact.toSnapshot(), evidence)).toEqual([]);
    const serialized = JSON.parse(JSON.stringify(serializeReaderSummaryArtifact(artifact)));
    const loaded = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(serialized, {
      id: original.readerSummaryId, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
      scopeType: 'workspace', interestId: null, cadence: snapshot.period.cadence,
      periodStartedAt: snapshot.period.startedAt, periodEndedAt: snapshot.period.endedAt, periodTimezone: snapshot.period.timezone,
      userId: null, subscriptionId: null, headline: draft.headline, summaryText: draft.executiveSummary, createdAt: snapshot.period.endedAt,
    }));
    const publicArtifact = readerSummaryArtifactViewFromReaderSummaryView(presentReaderSummaryArtifact(loaded,
      { status: 'fresh', checkedAt: new Date('2026-09-21T01:00:00Z') }));
    expect(publicArtifact.qualityFlags).toContain('limited_sources');
    expect(publicArtifact.readerBrief?.qualityState).toMatchObject({ status: 'limited_sources', flags: ['limited_sources'] });
    expect(publicArtifact.readerBrief?.qualityState.warnings).toContain('Coverage is limited because the headline verification budget was reached; some story headlines were not checked.');
    expect(publicArtifact.readerBrief?.topReads).toHaveLength(7);
    expect(publicArtifact.readerBrief?.selectedPosts).toHaveLength(2);
    expect(loaded.toSnapshot().promotionAttestations).toHaveLength(9);
    expect([...(publicArtifact.readerBrief?.topReads ?? []), ...(publicArtifact.readerBrief?.selectedPosts ?? [])]
      .map(card => card.promotionAttestation?.candidateId)).toEqual(selected.map(item => item.candidateId));
    expect(JSON.stringify(publicArtifact)).not.toContain('presentationCoverageLimited');
  });

  it.each([[7, false], [9, true]] as const)('fails below eight unique sealed stories after clustering (%i raw survivors, merged=%s)', async (count, merged) => {
    const fixture = setup(count, merged);
    await expect(fixture.subject.build({ job: fixture.job, manifest: fixture.manifest })).resolves.toEqual({ kind: 'budget_exhausted' });
    expect(fixture.tracked.attempted).toBe(32);
  });

  it('does not mark an ordinary fully examined small slate as budget limited', async () => {
    const fixture = workspaceSetup(Array.from({ length: 8 }, (_, index) => candidate(index + 1, 'important', 'central')));
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.evidence.promotionV3?.presentationCoverageLimited).toBeUndefined();
  });
});
