import {
  emptyReaderSummaryReliabilityReport,
  type ReaderSummaryContent,
} from '@social-monitor/summary/domain';

export const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

export const requireValue = <T>(
  value: T | undefined,
  message: string,
): T => {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
};

export const readerSummaryRestSmokeContent = (): ReaderSummaryContent => {
  const topRead = {
    title: 'OpenAI Codex is a high-signal AI tooling read',
    providerKey: 'github-repo-radar',
    providerName: 'GitHub Repo Radar',
    primaryActionKind: 'watch_repository' as const,
    reason:
      'The repository is connected to an active AI agent tooling discussion.',
    matchedInterestIds: ['topic-ai', 'topic-github'],
    matchedRules: ['agent-tooling', 'repository-growth'],
    signalScore: 2.4,
    confidence: {
      level: 'high' as const,
      score: 0.86,
      rationale:
        'Cross-provider support and direct canonical links are present.',
    },
    confirmedProviderKeys: ['reddit', 'github-repo-radar'],
    providerMetrics: [
      { label: 'GitHub stars', value: '54k' },
      { label: 'Reddit score', value: 'top discussion' },
    ],
    whyImportant: [
      'It matches the user preference for practical AI developer tooling.',
      'The same story appears in more than one provider.',
    ],
    whyNow:
      'The latest scan saw fresh Reddit discussion plus GitHub repo-radar evidence in the same window.',
    canonicalUrl: 'https://github.com/openai/codex',
    citationIds: ['citation-reddit', 'citation-github'],
  };

  return {
    headline: 'AI tooling sources agree on one practical signal',
    oneLineTakeaway:
      'Agent tooling is the clearest story because Reddit and GitHub point at the same theme.',
    bullets: [
      'Top read includes canonical source links for the UI.',
      'Source mix stays explicit so the reader can see where the signal came from.',
      'Memory guidance is applied without hiding the underlying citations.',
    ],
    qualityState: {
      status: 'ready',
      flags: [],
      warnings: [],
      isSingleSource: false,
    },
    interestSections: [
      {
        interestId: 'topic-ai',
        title: 'AI tooling',
        insight:
          'The useful story is not one isolated post but a repeated provider-backed signal.',
        items: [],
        citationIds: ['citation-reddit', 'citation-github'],
      },
    ],
    sourceMix: [
      {
        providerKey: 'reddit',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        interestIds: ['topic-ai'],
      },
      {
        providerKey: 'github-repo-radar',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        interestIds: ['topic-github'],
      },
    ],
    narrativeSections: [
      {
        id: 'reader-summary-rest-smoke-lead',
        kind: 'lead',
        title: 'Practical AI tooling momentum',
        text: 'Reddit discussion and GitHub activity support the same practical AI tooling signal.',
        citationIds: ['citation-reddit', 'citation-github'],
        storyClusterId: 'story:ai-tooling',
      },
    ],
    topReads: [topRead],
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: {
      newSignals: ['agent tooling'],
      growingSignals: ['github repo radar'],
      repeatedSignals: ['cross-provider AI tooling'],
      fadingSignals: [],
    },
    openQuestions: [
      'Will the repository keep gaining attention after the next scan?',
    ],
    risks: [
      'This is a live trend candidate, not a long-term adoption proof yet.',
    ],
    nextActions: [
      {
        kind: 'watch_repository',
        label: 'Watch repository',
        reason: 'Repo growth and Reddit attention are both present.',
        citationIds: ['citation-github'],
        canonicalUrl: 'https://github.com/openai/codex',
      },
    ],
  };
};

export type ReaderSummaryListResponseBody = {
  readonly items: readonly ReaderSummaryResponseBody[];
};

export type ReaderSummaryResponseBody = {
  readonly schemaVersion?: unknown;
  readonly readerSummaryId?: unknown;
  readonly period?: ReaderSummaryPeriodBody;
  readonly readerBrief?: {
    readonly topReads?: readonly {
      readonly title?: unknown;
      readonly canonicalUrl?: unknown;
      readonly providerName?: unknown;
      readonly primaryActionKind?: unknown;
      readonly whyNow?: unknown;
      readonly citationIds?: readonly unknown[];
      readonly confirmedProviderKeys?: readonly unknown[];
    }[];
    readonly sourceMix?: readonly {
      readonly providerKey?: unknown;
    }[];
  };
  readonly citations?: readonly {
    readonly citationId?: unknown;
    readonly label?: unknown;
    readonly providerKey?: unknown;
    readonly canonicalUrl?: unknown;
  }[];
  readonly personalization?: {
    readonly memoryGuidanceStatus?: unknown;
    readonly memoryGuidanceApplied?: unknown;
    readonly signals?: readonly unknown[];
  };
  readonly coverage?: {
    readonly hasCrossProviderEvidence?: unknown;
    readonly topProviderKeys?: readonly unknown[];
  };
};

export type RequestReaderSummaryResponseBody = {
  readonly readerSummaryJobId?: unknown;
  readonly status?: unknown;
  readonly created?: unknown;
  readonly period?: ReaderSummaryPeriodBody;
};

export type ReaderSummaryJobStatusResponseBody = {
  readonly readerSummaryJobId?: unknown;
  readonly readerSummaryId?: unknown;
  readonly period?: ReaderSummaryPeriodBody;
  readonly scope?: {
    readonly type?: unknown;
  };
  readonly status?: unknown;
  readonly failureClass?: unknown;
  readonly requestedAt?: unknown;
  readonly failedAt?: unknown;
  readonly timeline?: readonly {
    readonly status?: unknown;
    readonly message?: unknown;
  }[];
};

export type ReaderSummaryQualityRejectionBody = {
  readonly readerSummaryJobId?: unknown;
  readonly readerSummaryId?: unknown;
  readonly failureClass?: unknown;
  readonly reasonCodes?: readonly unknown[];
  readonly reasons?: readonly unknown[];
  readonly violations?: readonly {
    readonly code?: unknown;
    readonly reason?: unknown;
    readonly topReadTitle?: unknown;
    readonly citationId?: unknown;
    readonly feedItemId?: unknown;
    readonly sourceItemId?: unknown;
    readonly providerKey?: unknown;
    readonly canonicalUrl?: unknown;
  }[];
  readonly canonicalScore?: unknown;
  readonly shadow?: {
    readonly mode?: unknown;
    readonly riskScore?: unknown;
    readonly signals?: readonly unknown[];
  };
  readonly topReads?: readonly unknown[];
  readonly citations?: readonly unknown[];
};

export type ReaderSummaryPeriodBody = {
  readonly cadence?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly timezone?: unknown;
  readonly periodKey?: unknown;
};

export const requireString = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }

  return value;
};

export const assertReaderSummaryResponse = (
  body: ReaderSummaryResponseBody,
  readerSummaryId: string,
  cadence: 'daily' | 'weekly' | 'monthly',
): void => {
  assert(
    body.schemaVersion === 'reader_summary.artifact.v1',
    'reader-summaries REST must map reader summaries to the readerSummary artifact schema',
  );
  assert(
    body.readerSummaryId === readerSummaryId,
    'reader-summaries REST must expose readerSummaryId',
  );
  assertReaderSummaryPeriod(
    body.period,
    cadence,
    'reader-summaries REST must expose the artifact period',
  );
  assert(
    body.personalization?.memoryGuidanceStatus === 'available' &&
      body.personalization.memoryGuidanceApplied === true,
    'reader-summaries REST must preserve memory personalization evidence',
  );
  const personalization = requireValue(
    body.personalization,
    'reader-summaries REST personalization is missing',
  );
  assert(
    personalization.signals?.includes('keyword:agent tooling') === true,
    'reader-summaries REST must expose safe personalization signals',
  );
  assert(
    body.coverage?.hasCrossProviderEvidence === true,
    'reader-summaries REST must expose cross-provider coverage',
  );
  const coverage = requireValue(
    body.coverage,
    'reader-summaries REST coverage is missing',
  );
  assert(
    coverage.topProviderKeys?.includes('reddit') === true &&
      coverage.topProviderKeys.includes('github-repo-radar') === true,
    'reader-summaries REST coverage must include the provider mix',
  );

  const topRead = requireValue(
    body.readerBrief?.topReads?.[0],
    'reader-summaries REST must expose top reads',
  );
  assert(
    topRead.canonicalUrl === 'https://github.com/openai/codex',
    'reader-summaries REST top reads must include canonical URLs',
  );
  assert(
    topRead.providerName === 'GitHub Repo Radar',
    'reader-summaries REST top reads must expose provider display names',
  );
  assert(
    topRead.primaryActionKind === 'watch_repository',
    'reader-summaries REST top reads must expose the primary reader action',
  );
  assert(
    typeof topRead.whyNow === 'string' &&
      topRead.whyNow.includes('fresh Reddit discussion'),
    'reader-summaries REST top reads must explain why the item matters now',
  );
  assert(
    topRead.confirmedProviderKeys?.includes('reddit') === true &&
      topRead.confirmedProviderKeys.includes('github-repo-radar') === true,
    'reader-summaries REST top reads must preserve confirmed provider support',
  );

  const sourceProviders =
    body.readerBrief?.sourceMix?.map((source) => source.providerKey) ?? [];
  assert(
    sourceProviders.includes('reddit') &&
      sourceProviders.includes('github-repo-radar'),
    'reader-summaries REST reader brief must expose source mix',
  );

  const citations = requireValue(
    body.citations,
    'reader-summaries REST citations are missing',
  );
  const citationUrls = citations.map((citation) => citation.canonicalUrl);
  assert(
    citations.length >= 2 &&
      citationUrls.includes('https://github.com/openai/codex') === true &&
      citationUrls.includes(
        'https://www.reddit.com/r/LocalLLaMA/comments/example',
      ),
    'reader-summaries REST must expose canonical citation links',
  );
  assert(
    citations[0]?.label === '[1]' && citations[1]?.label === '[2]',
    'reader-summaries REST must expose stable citation labels',
  );
};

export const assertReaderSummaryJobStatus = (
  body: ReaderSummaryJobStatusResponseBody,
  readerSummaryJobId: string,
  cadence: 'daily' | 'weekly' | 'monthly',
): void => {
  assert(
    body.readerSummaryJobId === readerSummaryJobId,
    'readerSummary job status REST must expose the requested job id',
  );
  assert(
    body.scope?.type === 'workspace',
    'readerSummary job status REST must expose the requested scope',
  );
  assertReaderSummaryPeriod(
    body.period,
    cadence,
    'readerSummary job status REST must expose the requested period',
  );
  assert(
    body.status === 'requested',
    'readerSummary job status REST must expose requested status before worker drain',
  );
  assert(
    typeof body.requestedAt === 'string' && body.requestedAt.length > 0,
    'readerSummary job status REST must expose requestedAt',
  );
  assert(
    body.timeline?.some(
      (event) =>
        event.status === 'requested' &&
        event.message === 'Reader summary requested',
    ) === true,
    'reader summary job status REST must expose canonical timeline language',
  );
};

export const assertReaderSummaryQualityRejectedJobStatus = (
  body: ReaderSummaryJobStatusResponseBody,
  readerSummaryJobId: string,
  readerSummaryId: string,
): void => {
  assert(
    body.readerSummaryJobId === readerSummaryJobId,
    'readerSummary rejected job status REST must expose the requested job id',
  );
  assert(
    body.readerSummaryId === readerSummaryId,
    'readerSummary rejected job status REST must expose rejected artifact id',
  );
  assert(
    body.status === 'quality_rejected',
    'readerSummary rejected job status REST must expose quality_rejected',
  );
  assert(
    body.failureClass === 'quality_rejected',
    'readerSummary rejected job status REST must expose quality failure class',
  );
  assert(
    typeof body.failedAt === 'string' && body.failedAt.length > 0,
    'readerSummary rejected job status REST must expose failedAt',
  );
  assert(
    body.timeline?.some(
      (event) =>
        event.status === 'quality_rejected' &&
        event.message ===
          'Reader summary rejected by pre-publish quality gate',
    ) === true,
    'readerSummary rejected job status REST must expose quality timeline event',
  );
};

export const assertReaderSummaryQualityRejectionDebug = (
  body: ReaderSummaryQualityRejectionBody,
  readerSummaryJobId: string,
  readerSummaryId: string,
): void => {
  assert(
    body.readerSummaryJobId === readerSummaryJobId,
    'readerSummary rejection debug REST must expose the requested job id',
  );
  assert(
    body.readerSummaryId === readerSummaryId,
    'readerSummary rejection debug REST must expose rejected artifact id',
  );
  assert(
    body.failureClass === 'quality_rejected',
    'readerSummary rejection debug REST must expose quality failure class',
  );
  assert(
    body.reasonCodes?.includes('top_read_ineligible_source') === true,
    'readerSummary rejection debug REST must expose rejection reason codes',
  );
  assert(
    body.reasons?.length === 1,
    'readerSummary rejection debug REST must expose safe reasons',
  );
  assert(
    body.canonicalScore === 0.2,
    'readerSummary rejection debug REST must expose canonical score',
  );
  assert(
    body.violations?.some(
      (violation) =>
        violation.code === 'top_read_ineligible_source' &&
        violation.citationId === 'citation-github' &&
        violation.feedItemId === 'feed-github',
    ) === true,
    'readerSummary rejection debug REST must expose structured culprit diagnostics',
  );
  assert(
    body.shadow?.mode === 'shadow' && body.shadow.signals?.length === 1,
    'readerSummary rejection debug REST must expose shadow diagnostics',
  );
  assert(
    body.topReads?.length === 1 && (body.citations?.length ?? 0) >= 2,
    'readerSummary rejection debug REST must expose safe evidence diagnostics',
  );
};

export const assertReaderSummaryPeriod = (
  period: ReaderSummaryPeriodBody | undefined,
  cadence: 'daily' | 'weekly' | 'monthly',
  message: string,
): void => {
  const value = requireValue(period, message);
  assert(value.cadence === cadence, `${message}: cadence must be ${cadence}`);
  const startedAt = requireString(
    value.startedAt,
    `${message}: startedAt is required`,
  );
  const endedAt = requireString(
    value.endedAt,
    `${message}: endedAt is required`,
  );
  const timezone = requireString(
    value.timezone,
    `${message}: timezone is required`,
  );
  const periodKey = requireString(
    value.periodKey,
    `${message}: periodKey is required`,
  );
  assert(
    Date.parse(startedAt) < Date.parse(endedAt),
    `${message}: startedAt must be before endedAt`,
  );
  assert(
    periodKey.includes(`${cadence}:`) && periodKey.includes(timezone),
    `${message}: periodKey must include cadence and timezone`,
  );
};
