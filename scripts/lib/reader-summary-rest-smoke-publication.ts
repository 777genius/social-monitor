import {
  evaluateReaderSummaryGitHubProjection,
  notApplicableReaderSummaryGitHubProjectionAudit,
  ReaderSummaryPublicationPolicy,
  type ReaderSummaryArtifact,
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
  const projectionCheckedAt = new Date('2026-06-24T00:01:00.000Z');
  const publishedAt = new Date('2026-06-23T23:59:59.999Z');
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
      canonicalUrl: citation.canonicalUrl,
      repositoryFullName: `example/repository-${rank}`,
      rank,
      starsGained: 100 + rank,
      window: 'daily',
      checkedAt: projectionCheckedAt,
      publishedAt,
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
  const snapshot = artifact.toSnapshot();
  const rankingPolicyVersion = snapshot.lineage.rankingPolicyVersion;
  if (rankingPolicyVersion === undefined) {
    throw new Error('REST smoke publication evidence requires ranking lineage');
  }
  const topReadCitationIds = new Set(
    (snapshot.content?.topReads ?? []).flatMap((topRead) =>
      topRead.citationIds,
    ),
  );
  const selectedEvidence = snapshot.citationMap
    .filter((citation) => topReadCitationIds.has(citation.citationId))
    .map((citation) => {
      if (citation.canonicalUrl === undefined) {
        throw new Error('REST smoke publication evidence requires canonical URLs');
      }
      const cluster = snapshot.storyClusters.find(
        (candidate) =>
          candidate.representativeFeedItemId === citation.feedItemId ||
          candidate.duplicateFeedItemIds.includes(citation.feedItemId),
      );
      return {
        feedItemId: citation.feedItemId,
        sourceItemId: citation.sourceItemId,
        sourceBindingId: `reader-summary-rest-smoke-${citation.providerKey}`,
        interestId: cluster?.interestIds[0] ?? 'topic-ai',
        providerKey: citation.providerKey,
        providerName:
          citation.providerKey === 'reddit' ? 'Reddit' : 'GitHub Repo Radar',
        canonicalUrl: citation.canonicalUrl,
        title: 'OpenAI Codex is a high-signal AI tooling read',
        bodyPreview: 'Independent sources show practical AI tooling momentum.',
        publishedAt: snapshot.sourceWindow.startedAt,
        observedAt: snapshot.sourceWindow.endedAt,
        score: cluster?.score ?? 1,
        whyImportant: ['It supports the summary lead with eligible evidence.'],
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
      };
    });
  const evidence = {
    rankingPolicyVersion,
    personalization: snapshot.personalization,
    sourceWindow: snapshot.sourceWindow,
    clusters: snapshot.storyClusters,
    selectedEvidence,
  } satisfies SummaryEvidenceSelection;
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
