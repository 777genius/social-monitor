import {
  buildReaderPostPromotionProjection,
  evaluateReaderSummaryGitHubProjection,
  notApplicableReaderSummaryGitHubProjectionAudit,
  ReaderSummaryPublicationPolicy,
  ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
  ReaderSummaryJob,
  type SummaryEvidenceSelection,
} from '@social-monitor/summary/domain';
import { publishReaderSummaryJob } from '@social-monitor/summary/features/execute-reader-summary-job/publish-reader-summary-job';
import type {
  PublishableReaderSummaryPublicationDecision,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationPort,
} from '@social-monitor/summary/ports';
import { CryptoIdGenerator, FixedClock } from '@social-monitor/shared-kernel';

import {
  buildReaderSummaryPublicationPayload,
  stablePublicationJson,
} from '../../libs/summary/adapters/persistence/reader-summary-publication-proof';
import { assert } from './reader-summary-rest-smoke-contract';

export const dailyGitHubProjectionFixture = () => {
  const projectionCheckedAt = new Date('2026-06-23T08:30:00.000Z');
  const fetchStartedAt = new Date('2026-06-23T08:29:00.000Z');
  const citations = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      citationId: `github-trending-citation-${rank}`,
      feedItemId: `github-trending-feed-${rank}`,
      sourceItemId: `github-trending-source-${rank}`,
      providerKey: 'github-trending-page',
      field: 'canonicalUrl' as const,
      canonicalUrl: `https://github.com/example/repository-${rank}`,
    };
  });
  const selectedPosts = citations.map((citation, index) => {
    const rank = index + 1;
    return {
      title: `example/repository-${rank}`,
      providerKey: 'github-trending-page',
      providerName: 'GitHub Trending',
      primaryActionKind: 'watch_repository' as const,
      reason: 'The repository appears in the durable daily trending board.',
      matchedInterestIds: ['topic-github'],
      matchedRules: ['github-trending'],
      signalScore: 1,
      confidence: {
        level: 'medium' as const,
        score: 0.7,
        rationale: 'GitHub reports the exact daily rank and star gain.',
      },
      confirmedProviderKeys: ['github-trending-page'],
      providerMetrics: [
        {
          label: 'GitHub Trending today',
          value: `#${rank}, +${100 + rank} stars today`,
        },
      ],
      whyImportant: ['The repository has visible daily momentum.'],
      whyNow: "It appears in today's durable GitHub Trending projection.",
      canonicalUrl: citation.canonicalUrl,
      citationIds: [citation.citationId],
    };
  });
  const items = citations.map((citation, index) => {
    const rank = index + 1;
    return {
      feedItemId: citation.feedItemId,
      sourceItemId: citation.sourceItemId,
      sourceBindingId: 'github-trending-binding',
      providerKey: 'github-trending-page',
      metadataKind: 'github_trending_page_repository',
      scanJobId: 'github-trending-binding-scan',
      canonicalUrl: citation.canonicalUrl,
      repositoryFullName: `example/repository-${rank}`,
      rank,
      starsGained: 100 + rank,
      window: 'daily',
      fetchStartedAt,
      checkedAt: projectionCheckedAt,
      publishedAt: projectionCheckedAt,
      observedAt: projectionCheckedAt,
      sourceContentHash: 'a'.repeat(64),
      sourceProviderContentHash: 'b'.repeat(64),
    };
  });

  return {
    citations,
    selectedPosts,
    items,
    observedThrough: projectionCheckedAt,
  };
};

export const requireVerifiedProjection = (
  artifact: ReaderSummaryArtifact,
  fixture: ReturnType<typeof dailyGitHubProjectionFixture>,
): ReaderSummaryGitHubProjectionAudit => {
  const projection = evaluateReaderSummaryGitHubProjection({
    artifact,
    eligibleBindingIds: ['github-trending-binding'],
    items: fixture.items,
    pageCount: 1,
    observedThrough: fixture.observedThrough,
  });
  assert(
    projection.audit.status === 'verified' &&
      projection.findings.length === 0 &&
      projection.audit.bindings.length === 10,
    'REST smoke daily artifact requires an exact durable GitHub projection',
  );
  return projection.audit;
};

export const requireNotApplicableProjection = (
  artifact: ReaderSummaryArtifact,
): ReaderSummaryGitHubProjectionAudit => {
  const projection = notApplicableReaderSummaryGitHubProjectionAudit({
    artifact,
  });
  assert(
    projection.audit.status === 'not_applicable' &&
      projection.findings.length === 0,
    'REST smoke non-daily artifact must have exact not-applicable projection proof',
  );
  return projection.audit;
};

const promotionEvidenceForArtifact = (
  artifact: ReaderSummaryArtifact,
): SummaryEvidenceSelection => {
  const snapshot = artifact.toSnapshot();
  const citation = snapshot.citationMap.find(
    (candidate) => candidate.citationId === 'citation-github',
  );
  const redditCitation = snapshot.citationMap.find(
    (candidate) => candidate.citationId === 'citation-reddit',
  );
  if (citation?.canonicalUrl === undefined) {
    throw new Error('REST smoke promotion requires the canonical GitHub citation');
  }
  if (redditCitation?.canonicalUrl === undefined) {
    throw new Error('REST smoke promotion requires the canonical Reddit citation');
  }
  const sourceWindow = {
    ...snapshot.sourceWindow,
    selectedFeedItemIds: snapshot.sourceWindow.selectedFeedItemIds.filter(
      (feedItemId) => !feedItemId.startsWith('github-trending-feed-'),
    ),
    periodStartedAt: snapshot.period.startedAt,
    periodEndedAt: snapshot.period.endedAt,
    ingestionCutoff: snapshot.sourceWindow.endedAt,
  };
  const checkedAt = sourceWindow.endedAt;
  const publishedAt = sourceWindow.startedAt;
  return {
    rankingPolicyVersion:
      snapshot.lineage.rankingPolicyVersion ?? 'story_ranking_v1',
    personalization: snapshot.personalization,
    sourceWindow,
    clusters: snapshot.storyClusters.map((cluster) =>
      cluster.id === 'story:ai-tooling'
        ? {
            ...cluster,
            representativeFeedItemId: citation.feedItemId,
            duplicateFeedItemIds: [redditCitation.feedItemId],
            providerKeys: [citation.providerKey, redditCitation.providerKey],
          }
        : cluster,
    ),
    selectedEvidence: [
      {
        feedItemId: citation.feedItemId,
        sourceItemId: citation.sourceItemId,
        sourceBindingId: 'reader-summary-rest-smoke-github-repo-radar',
        interestId: 'topic-github',
        providerKey: citation.providerKey,
        providerName: 'GitHub Repo Radar',
        canonicalUrl: citation.canonicalUrl,
        title: 'OpenAI Codex is a high-signal AI tooling read',
        bodyPreview: 'Independent sources show practical AI tooling momentum.',
        publishedAt,
        observedAt: checkedAt,
        score: 2.4,
        whyImportant: [
          'It matches the user preference for practical AI developer tooling.',
        ],
        providerMetricLabels: [
          { label: 'Trend 24h', value: '+50' },
        ],
        readerActionKind: 'watch_repository',
        contentQuality: {
          qualityScore: 0.9,
          interestRelevanceScore: 0.9,
          engagementIntegrityScore: 0.9,
          eligibleForSummary: true,
          eligibleForTopRead: true,
          needsLlmReview: false,
          decision: 'eligible',
          flags: [],
          reason: 'Deterministic REST smoke evidence is publication eligible.',
        },
        promotionFacts: {
          contentKind: 'repository',
          canonicalIdentity: `url:${citation.canonicalUrl}`,
          checkedAt,
          safetyValid: true,
          freshnessValid: true,
          freshnessProvenance: {
            status: 'observed',
            publishedAt,
            observedAt: checkedAt,
            ingestionCutoff: checkedAt,
          },
          metricsState: 'observed',
          metrics: {
            provider: 'github_radar',
            snapshotKind: 'repository_growth',
            windowStartedAt: new Date(checkedAt.getTime() - 24 * 60 * 60 * 1_000),
            windowEndedAt: checkedAt,
            starsDelta: 50,
            forksDelta: 0,
          },
        },
      },
      {
        feedItemId: redditCitation.feedItemId,
        sourceItemId: redditCitation.sourceItemId,
        sourceBindingId: 'reader-summary-rest-smoke-reddit',
        interestId: 'topic-ai',
        providerKey: redditCitation.providerKey,
        providerName: 'Reddit',
        canonicalUrl: redditCitation.canonicalUrl,
        title: 'Independent discussion confirms the Codex story',
        bodyPreview: 'Fresh Reddit discussion independently supports the repository story.',
        publishedAt,
        observedAt: checkedAt,
        score: 2.1,
        whyImportant: [
          'Fresh Reddit discussion independently supports the same story.',
        ],
        providerMetricLabels: [
          { label: 'Reddit score', value: '25' },
          { label: 'Reddit upvote ratio', value: '0.55' },
        ],
        contentQuality: {
          qualityScore: 0.9,
          interestRelevanceScore: 0.9,
          engagementIntegrityScore: 0.9,
          eligibleForSummary: true,
          eligibleForTopRead: true,
          needsLlmReview: false,
          decision: 'eligible',
          flags: [],
          reason: 'Independent REST smoke support is publication eligible.',
        },
        promotionFacts: {
          contentKind: 'original_post',
          canonicalIdentity: `url:${redditCitation.canonicalUrl}`,
          authorityAttestation: {
            status: 'attested',
            official: true,
            trusted: true,
            attestedBy: 'source_catalog',
          },
          safetyValid: true,
          freshnessValid: true,
          freshnessProvenance: {
            status: 'observed',
            publishedAt,
            observedAt: checkedAt,
            ingestionCutoff: checkedAt,
          },
          metricsState: 'observed',
          metrics: {
            provider: 'reddit',
            score: 25,
            upvoteRatio: 0.55,
          },
        },
      },
    ],
    approvedSameStoryRelations: [
      {
        canonicalPairId: [citation.feedItemId, redditCitation.feedItemId]
          .sort().join('\u0000'),
        leftFeedItemId: citation.feedItemId,
        rightFeedItemId: redditCitation.feedItemId,
        confidence: 0.92,
        verificationLane: 'semantic_primary',
        candidatePolicyVersion: 'reader_summary.story_relation.candidate.v1',
        rankingPolicyVersion: 'story_ranking_v10',
        featureDigest: 'a'.repeat(64),
        executionAttestationSha256: 'b'.repeat(64),
        normalizedOutputSha256: 'c'.repeat(64),
        selectedOutputSha256: 'd'.repeat(64),
      },
    ],
    relatedTopicRelations: [],
  };
};

export const promoteRestSmokeArtifact = (
  artifact: ReaderSummaryArtifact,
): ReaderSummaryArtifact => {
  const snapshot = artifact.toSnapshot();
  const evidence = promotionEvidenceForArtifact(artifact);
  const citationMap = snapshot.citationMap.filter(
    (citation) => citation.providerKey !== 'github-trending-page',
  );
  const projection = buildReaderPostPromotionProjection({
    evidence: evidence.selectedEvidence,
    clusters: evidence.clusters,
    citations: citationMap,
    sourceWindow: evidence.sourceWindow,
    approvedSameStoryRelations: evidence.approvedSameStoryRelations,
    relatedTopicRelations: evidence.relatedTopicRelations,
    attestationBinding: {
      artifactId: snapshot.readerSummaryId,
      sourceWindow: evidence.sourceWindow,
    },
  });
  return ReaderSummaryArtifact.create({
    ...snapshot,
    sourceWindow: evidence.sourceWindow,
    storyClusters: evidence.clusters,
    citationMap,
    content: {
      ...snapshot.content!,
      topReads: projection.topReads,
      selectedPosts: projection.additionalPosts,
    },
    promotionAttestations: projection.attestations,
    promotionEvidenceFacts: projection.attestedEvidenceFacts,
    relatedTopicRelations: [],
  });
};

export const publishFixture = async (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly projectionAudit: ReaderSummaryGitHubProjectionAudit;
  readonly repository: ReaderSummaryArtifactRepositoryPort;
  readonly jobs: ReaderSummaryJobRepositoryPort;
  readonly publications: ReaderSummaryPublicationPort;
  readonly jobId: string;
  readonly requestedAt: Date;
  readonly completedAt: Date;
}): Promise<void> => {
  const artifact = params.artifact.toSnapshot();
  const publicationDecision = requirePublishableDecision(params.artifact);
  const runningJob = ReaderSummaryJob.request({
    id: params.jobId,
    tenantId: artifact.tenantId,
    workspaceId: artifact.workspaceId,
    scope: artifact.scope,
    period: artifact.period,
    userId: artifact.userId,
    subscriptionId: artifact.subscriptionId,
    idempotencyKey: `reader-summary-rest-smoke-publication:${params.jobId}`,
    requestedAt: params.requestedAt,
  }).start({ startedAt: params.requestedAt });
  await params.jobs.save(runningJob);
  await params.repository.save(params.artifact, {
    publicationDecision,
    githubProjectionAudit: params.projectionAudit,
  });

  const result = await publishReaderSummaryJob({
    artifact: params.artifact,
    runningJob,
    publicationDecision,
    githubProjectionAudit: params.projectionAudit,
    jobs: params.jobs,
    publications: exactProofPublication(params.publications),
    ids: new CryptoIdGenerator(),
    clock: new FixedClock(params.completedAt),
  });
  assert(
    result.ok &&
      result.value.readerSummaryId === artifact.readerSummaryId &&
      result.value.status === 'completed',
    'REST smoke fixture must become visible only through publication',
  );
};

const requirePublishableDecision = (
  artifact: ReaderSummaryArtifact,
): PublishableReaderSummaryPublicationDecision => {
  const evidence = promotionEvidenceForArtifact(artifact);
  const decision = new ReaderSummaryPublicationPolicy().evaluate({
    artifact,
    evidence,
  });
  assert(
    decision.status === 'published',
    `REST smoke artifact must pass the production publication policy: ${decision.reasons.join('; ')}`,
  );
  if (decision.status !== 'published') {
    throw new Error('REST smoke publication policy narrowing failed');
  }
  return decision;
};

const exactProofPublication = (
  publication: ReaderSummaryPublicationPort,
): ReaderSummaryPublicationPort => ({
  publish: async (
    command: ReaderSummaryPublicationCommand,
  ) => {
    const payload = buildReaderSummaryPublicationPayload(command);
    const proof = payload.exactProof;
    const reportQualitySignals = payload.report.qualitySignals;
    assert(
      proof.readerSummaryJobId === payload.readerSummaryJobId &&
        proof.readerSummaryArtifactId === payload.readerSummaryArtifactId &&
        proof.reportSha256 === payload.reportSha256 &&
        /^[a-f0-9]{64}$/.test(payload.reportSha256) &&
        /^[a-f0-9]{64}$/.test(payload.proofSha256),
      'REST smoke publication must carry exact report and proof bindings',
    );
    assert(
      typeof reportQualitySignals === 'object' &&
        reportQualitySignals !== null &&
        stablePublicationJson(
          (reportQualitySignals as Record<string, unknown>)
            .githubProjectionAudit,
        ) === stablePublicationJson(command.githubProjectionAudit),
      'REST smoke publication proof must retain the exact projection audit',
    );
    return publication.publish(command);
  },
});
