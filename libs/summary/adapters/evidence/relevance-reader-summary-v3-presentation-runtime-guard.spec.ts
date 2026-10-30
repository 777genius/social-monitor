import { serializeReaderSummaryArtifact } from '../persistence/prisma/prisma-reader-summary-json';
import { normalizeReaderSummaryArtifactPayload } from '../persistence/prisma/prisma-reader-summary-artifact-payload';
import { readerSummaryArtifactViewFromReaderSummaryView } from '../../interfaces/rest/reader-summary-rest.mapper';
import { ReaderSummaryArtifact } from '../../domain';
import type { PromotionPresentationBuilder } from '../../domain/services/reader-post-presentation-v3';
import { readerSummaryV3PromotionFindings } from '../../domain/policies/reader-summary-v3-publication';
import { artifact as baselineArtifact } from '../../domain/policies/reader-summary-publication-policy-test-fixtures';
import { buildReaderSummaryDraftWithPromotionContent, presentationRuntimeCoverageWarning } from
  '../../features/execute-reader-summary-job/reader-summary-promotion-content';
import { buildReaderSummaryPromotionArtifactFields } from '../../features/execute-reader-summary-job/reader-summary-promotion-artifact-fields';
import { presentReaderSummaryArtifact } from '../../features/shared/reader-summary-artifact-presenter';
import { candidate, TestPresentation, workspaceSetup } from './relevance-reader-summary-v3-promotion.fixture';

/** Fails the listed 1-based batch calls the way the runtime builder reports them. */
const runtimeFailingBatches = (failing: (call: number) => boolean) => {
  const tracked = new TestPresentation();
  let calls = 0;
  const failed = new Set<string>();
  const presentation: PromotionPresentationBuilder = { build: async inputs => {
    calls += 1;
    if (!failing(calls)) return tracked.build(inputs);
    inputs.forEach(input => failed.add(input.candidateId));
    return inputs.map(() => ({ status: 'unavailable' as const, reason: 'runtime_failure' as const }));
  } };
  return { presentation, failed, calls: () => calls };
};

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({
  ...candidate(index + 1, 'important', 'central'),
  title: `Independent event ${index}`, body: `Independent observed event ${index} with exact source evidence.`,
}));

describe('V3 promotion presentation runtime failures', () => {
  it('skips isolated runtime-failed batches and discloses the gap in the published artifact', async () => {
    const runtime = runtimeFailingBatches(call => call === 1 || call === 3);
    const fixture = workspaceSetup(rows(16), undefined, runtime.presentation);
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error(result.kind);
    expect(runtime.failed.size).toBe(8);
    const selection = result.evidence.promotionV3!;
    expect(selection.presentationRuntimeDegraded).toBe(true);
    expect(selection.presentationCoverageLimited).toBeUndefined();
    const selected = [...selection.top, ...selection.additional];
    expect(selected).toHaveLength(8);
    expect(selected.some(item => runtime.failed.has(item.candidateId))).toBe(false);
    expect(selection.excluded.filter(item => runtime.failed.has(item.candidateId))
      .every(item => item.reason === 'presentation_unavailable')).toBe(true);

    const evidence = result.evidence, original = baselineArtifact().toSnapshot();
    const citationMap = evidence.selectedEvidence.map((item, index) => ({ citationId: `c${index + 1}`,
      feedItemId: item.feedItemId, sourceItemId: item.sourceItemId, providerKey: item.providerKey,
      field: 'title' as const, canonicalUrl: item.canonicalUrl }));
    const topStories = evidence.clusters.map((cluster, index) => ({ storyClusterId: cluster.id,
      title: `Observed method ${index}`, summary: `The source documents independently observed method ${index}.`,
      interestIds: cluster.interestIds, providerKeys: cluster.providerKeys,
      citationIds: [citationMap.find(c => c.feedItemId === cluster.representativeFeedItemId)!.citationId] }));
    const draft = buildReaderSummaryDraftWithPromotionContent(evidence, { ...original, citationMap, topStories,
      qualityFlags: [], noSignalReason: undefined, content: { ...original.content!, narrativeSections: [{
        id: 'lead', kind: 'lead' as const, title: 'Independent method observations',
        text: 'Independent method observations from two providers.', citationIds: ['c1', 'c2'] }] } });
    const snapshot = fixture.job.toSnapshot();
    const artifact = ReaderSummaryArtifact.create({ ...original, ...draft,
      tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId, scope: snapshot.scope, period: snapshot.period,
      sourceWindow: evidence.sourceWindow, storyClusters: evidence.clusters,
      ...buildReaderSummaryPromotionArtifactFields({ artifactId: original.readerSummaryId, modelEvidence: evidence, draft }) });
    expect(readerSummaryV3PromotionFindings(artifact.toSnapshot(), evidence)).toEqual([]);
    const loaded = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(
      JSON.parse(JSON.stringify(serializeReaderSummaryArtifact(artifact))), {
        id: original.readerSummaryId, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
        scopeType: 'workspace', interestId: null, cadence: snapshot.period.cadence,
        periodStartedAt: snapshot.period.startedAt, periodEndedAt: snapshot.period.endedAt,
        periodTimezone: snapshot.period.timezone, userId: null, subscriptionId: null,
        headline: draft.headline, summaryText: draft.executiveSummary, createdAt: snapshot.period.endedAt,
      }));
    const publicArtifact = readerSummaryArtifactViewFromReaderSummaryView(presentReaderSummaryArtifact(loaded,
      { status: 'fresh', checkedAt: new Date('2026-09-21T01:00:00Z') }));
    expect(publicArtifact.qualityFlags).toContain('limited_sources');
    expect(publicArtifact.readerBrief?.qualityState.warnings).toContain(presentationRuntimeCoverageWarning);
    expect(JSON.stringify(publicArtifact)).not.toContain('presentationRuntimeDegraded');
  });

  it('stops the job as a dependency failure after two back-to-back runtime-failed batches', async () => {
    const runtime = runtimeFailingBatches(() => true);
    const fixture = workspaceSetup(rows(16), undefined, runtime.presentation);
    await expect(fixture.subject.build({ job: fixture.job, manifest: fixture.manifest })).resolves.toEqual({
      kind: 'dependency_failure', reason: 'presentation_runtime_failure_repeated' });
    expect(runtime.calls()).toBe(2);
  });

  it('does not disclose a runtime gap when every presentation task ran', async () => {
    const fixture = workspaceSetup(rows(8));
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.evidence.promotionV3?.presentationRuntimeDegraded).toBeUndefined();
  });
});
