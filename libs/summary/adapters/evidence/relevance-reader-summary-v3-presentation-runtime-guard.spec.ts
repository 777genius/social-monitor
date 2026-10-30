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
import { PresentationRuntimeGuardedPromotion } from './relevance-reader-summary-v3-presentation-runtime-guard';

/** Fails the selected 1-based batch calls the way the runtime builder reports them. */
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
  ...candidate(index + 1, 'important', 'central'), provider: index % 2 === 0 ? 'reddit' : 'hacker-news',
  title: `Independent event ${index}`, body: `Independent observed event ${index} with exact source evidence.`,
}));

const guardedSetup = (presentation: PromotionPresentationBuilder, count = 16) => {
  const fixture = workspaceSetup(rows(count));
  const promotion = new PresentationRuntimeGuardedPromotion(presentation,
    guarded => workspaceSetup(rows(count), undefined, guarded).subject);
  return { ...fixture, run: () => promotion.build({ job: fixture.job, manifest: fixture.manifest }) };
};

describe('V3 promotion presentation runtime failures', () => {
  it('skips a single runtime-failed batch and discloses the gap in the published artifact', async () => {
    const runtime = runtimeFailingBatches(call => call === 2);
    const fixture = guardedSetup(runtime.presentation);
    const result = await fixture.run();
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error(result.kind);
    const evidence = result.evidence;
    expect(runtime.failed.size).toBe(4);
    expect(evidence.presentationRuntimeDegraded).toBe(true);
    expect(evidence.promotionV3?.presentationCoverageLimited).toBeUndefined();
    expect(evidence.selectedEvidence.length).toBeGreaterThan(0);
    expect(evidence.selectedEvidence.some(item => runtime.failed.has(item.feedItemId))).toBe(false);
    expect(evidence.selectedEvidence.every(item => item.readerHeadline?.status === 'accepted')).toBe(true);

    const original = baselineArtifact().toSnapshot();
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
    expect(draft.qualityFlags).toContain('limited_sources');
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

  it.each([
    ['two back-to-back failed batches', (call: number) => call <= 2, 2],
    ['a failed share above max(4, 25%) of attempts', (call: number) => call === 1 || call === 3, 3],
  ] as const)('stops the run as a dependency failure after %s', async (_name, failing, calls) => {
    const runtime = runtimeFailingBatches(failing);
    await expect(guardedSetup(runtime.presentation).run()).resolves.toEqual({
      kind: 'dependency_failure', reason: 'presentation_runtime_failure_repeated' });
    expect(runtime.calls()).toBe(calls);
  });

  it('reports the runtime, not the content, when skips leave nothing publishable', async () => {
    const runtime = runtimeFailingBatches(() => true);
    await expect(guardedSetup(runtime.presentation, 4).run()).resolves.toEqual({
      kind: 'dependency_failure', reason: 'presentation_runtime_failure' });
    expect(runtime.calls()).toBe(1);
  });

  it('starts every run with a fresh failure count and no disclosure when every task ran', async () => {
    let call = 0;
    const tracked = new TestPresentation();
    // Run one ends on a failed batch; run two starts with one. Shared state would trip.
    const presentation: PromotionPresentationBuilder = { build: async inputs => {
      call += 1;
      return call === 4 || call === 5
        ? inputs.map(() => ({ status: 'unavailable' as const, reason: 'runtime_failure' as const }))
        : tracked.build(inputs);
    } };
    const fixture = guardedSetup(presentation);
    expect((await fixture.run()).kind).toBe('ready');
    expect(call).toBe(4);
    expect((await fixture.run()).kind).toBe('ready');
    const clean = await guardedSetup(new TestPresentation(), 8).run();
    expect(clean.kind).toBe('ready');
    if (clean.kind === 'ready') expect(clean.evidence.presentationRuntimeDegraded).toBeUndefined();
  });
});
