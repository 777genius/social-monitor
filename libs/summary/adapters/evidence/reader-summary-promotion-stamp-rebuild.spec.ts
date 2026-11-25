import { serializeReaderSummaryArtifact } from '../persistence/prisma/prisma-reader-summary-json';
import { normalizeReaderSummaryArtifactPayload } from '../persistence/prisma/prisma-reader-summary-artifact-payload';
import { readerSummaryArtifactViewFromReaderSummaryView } from '../../interfaces/rest/reader-summary-rest.mapper';
import { READER_PROMOTION_POLICY_STAMP, ReaderSummaryArtifact } from '../../domain';
import { canonicalPromotionPayload, promotionPayloadDigest } from '../../domain/services/reader-post-promotion-attestation';
import { artifact as baselineArtifact } from '../../domain/policies/reader-summary-publication-policy-test-fixtures';
import { buildReaderSummaryDraftWithPromotionContent } from '../../features/execute-reader-summary-job/reader-summary-promotion-content';
import { buildReaderSummaryPromotionArtifactFields } from '../../features/execute-reader-summary-job/reader-summary-promotion-artifact-fields';
import { presentReaderSummaryArtifact } from '../../features/shared/reader-summary-artifact-presenter';
import { candidate, scoredRedditCandidate, workspaceSetup } from './relevance-reader-summary-v3-promotion.fixture';

type Json = Record<string, unknown>;

describe('Reader promotion policy stamp on persisted artifacts', () => {
  it('serves a current board with Top and news blocks through REST', async () => {
    const published = await publishedBoard();
    const view = restView(published.serialized, published);

    expect(view.freshness.status).toBe('fresh');
    // Two Reddit posts are below the minimum popularity cohort: no signal.
    expect(view.readerBrief.topReads.map(card => card.signalScore)).toEqual([0, 0]);
    expect(view.readerBrief.newsWithoutRatingPosts).toHaveLength(1);
    expect(view.readerBrief.newsWithoutRatingPosts[0]?.promotionAttestation)
      .toMatchObject({ placement: 'news', decision: 'promote_news',
        policyVersion: READER_PROMOTION_POLICY_STAMP });
  });

  // Old days are outdated, not corrupt: they open as "rebuild required".
  it('reads a board ranked under the previous policy as rebuild required', async () => {
    const published = await publishedBoard();
    const previous = withPreviousPolicy(published.serialized);
    const normalized = normalizeReaderSummaryArtifactPayload(previous, published.fallback);

    expect(normalized.promotionBoardState).toBe('rebuild_required');
    expect(normalized.promotionAttestations).toEqual([]);
    expect(() => ReaderSummaryArtifact.rehydrate(normalized)).not.toThrow();
    const view = restView(previous, published);
    expect(view.freshness).toMatchObject({ status: 'stale', reason: 'ranking_policy_changed' });
    expect([view.readerBrief.topReads, view.readerBrief.selectedPosts,
      view.readerBrief.newsWithoutRatingPosts]).toEqual([[], [], []]);
  });
});

const publishedBoard = async () => {
  const fixture = workspaceSetup([
    scoredRedditCandidate(2, 984), scoredRedditCandidate(4, 0),
    candidate(1, 'useful', 'central'),
  ]);
  const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
  if (result.kind !== 'ready') throw new Error(result.kind);
  const evidence = result.evidence;
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
      citationIds: ['c1', 'c3'] }] } };
  const draft = buildReaderSummaryDraftWithPromotionContent(evidence, modelDraft);
  const snapshot = fixture.job.toSnapshot();
  const artifact = ReaderSummaryArtifact.create({ ...original, ...draft,
    tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId, scope: snapshot.scope, period: snapshot.period,
    sourceWindow: evidence.sourceWindow, storyClusters: evidence.clusters,
    ...buildReaderSummaryPromotionArtifactFields({ artifactId: original.readerSummaryId, modelEvidence: evidence, draft }) });
  const fallback = { id: original.readerSummaryId, tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId, scopeType: 'workspace', interestId: null,
    cadence: snapshot.period.cadence, periodStartedAt: snapshot.period.startedAt,
    periodEndedAt: snapshot.period.endedAt, periodTimezone: snapshot.period.timezone,
    userId: null, subscriptionId: null, headline: draft.headline,
    summaryText: draft.executiveSummary, createdAt: snapshot.period.endedAt };
  return { serialized: JSON.parse(JSON.stringify(serializeReaderSummaryArtifact(artifact))) as Json, fallback };
};

const restView = (payload: Json, published: Awaited<ReturnType<typeof publishedBoard>>) =>
  readerSummaryArtifactViewFromReaderSummaryView(presentReaderSummaryArtifact(
    ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(payload, published.fallback)),
    { status: 'fresh', checkedAt: new Date('2026-09-21T01:00:00Z') }));

/** The shape persisted before this policy: old stamp and the old comparator. */
const withPreviousPolicy = (payload: Json): Json => {
  const copy = JSON.parse(JSON.stringify(payload)) as Json;
  const content = copy.content as Record<string, Json[]>;
  const news = content.newsWithoutRatingPosts ?? [];
  delete content.newsWithoutRatingPosts;
  content.topReads = [...content.topReads!, ...news.map(card =>
    ({ ...card, cardKind: 'curated_top_read', promotionTier: 'top' }))];
  for (const card of [...content.topReads, ...(content.selectedPosts ?? [])]) {
    if (card.promotionMarker !== undefined) card.promotionPolicyVersion = 'reader_post_promotion.v3';
  }
  copy.promotionAttestations = (copy.promotionAttestations as Json[]).map((value) => {
    const comparator = value.comparator as Json;
    const body: Json = { ...value,
      policyVersion: 'reader_post_promotion.v3', placement: 'top', decision: 'promote_top',
      comparator: { usefulness: comparator.usefulness, relevance: comparator.relevance,
        publishedAt: comparator.publishedAt, candidateId: comparator.candidateId } };
    delete body.digest;
    delete body.canonicalPayload;
    const canonicalPayload = canonicalPromotionPayload(body);
    return { ...body, canonicalPayload, digest: promotionPayloadDigest(canonicalPayload) };
  });
  return copy;
};
