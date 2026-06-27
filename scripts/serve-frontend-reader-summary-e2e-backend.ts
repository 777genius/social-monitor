import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { URL } from 'node:url';

const tenantId = 'tenant-frontend-reader-summary-e2e';
const workspaceId = 'workspace-frontend-reader-summary-e2e';
const userId = 'user-frontend-reader-summary-e2e';
const readerSummaryId = 'readerSummary-frontend-reader-summary-e2e';
const summaryId = 'summary-frontend-reader-summary-e2e';
const startedAt = '2026-06-24T08:00:00.000Z';
const endedAt = '2026-06-24T08:30:00.000Z';
const checkedAt = '2026-06-24T08:31:00.000Z';

type JsonObject = Record<string, unknown>;
type FeedbackSignal = {
  readonly feedbackId: string;
  readonly userId: string;
  readonly action: string;
  readonly rating: number | null;
  readonly target: {
    readonly feedItemId: string | null;
    readonly providerKey: string;
    readonly topicId: string;
  };
  readonly createdAt: string;
};
type RecordedFeedbackSignal = {
  readonly action: string;
  readonly bodyPreview: string | null;
  readonly canonicalUrl: string | null;
  readonly idempotencyKey: string | null;
  readonly providerKey: string;
  readonly rating: number | null;
  readonly title: string | null;
  readonly topicId: string;
};

const dailyTrendingSeeds = [
  [
    'calesthio/OpenMontage',
    'https://github.com/calesthio/OpenMontage',
    '18,398',
    '#1, +3,703 stars today',
  ],
  [
    'apple/container',
    'https://github.com/apple/container',
    '41,719',
    '#2, +1,746 stars today',
  ],
  [
    'ZhuLinsen/daily_stock_analysis',
    'https://github.com/ZhuLinsen/daily_stock_analysis',
    '48,201',
    '#3 daily signal',
  ],
  [
    'interviewstreet/hiring-agent',
    'https://github.com/interviewstreet/hiring-agent',
    '1,971',
    '#4 daily signal',
  ],
  [
    'JCodesMore/ai-website-cloner-template',
    'https://github.com/JCodesMore/ai-website-cloner-template',
    '1,200',
    '#5 daily signal',
  ],
  [
    'microsoft/playwright',
    'https://github.com/microsoft/playwright',
    '76,000',
    'Repo Radar follow-up for sustained growth',
  ],
  [
    'openai/codex',
    'https://github.com/openai/codex',
    '54,000',
    'Repo Radar follow-up for sustained growth',
  ],
] as const;

const feedbackSignals: RecordedFeedbackSignal[] = [];
const topReads = dailyTrendingSeeds.map(
  ([title, canonicalUrl, stars, trend], index) => ({
    title,
    providerKey: index < 5 ? 'github-trending-page' : 'github-repo-radar',
    reason:
      index === 0
        ? 'Top repository on github.com/trending today, with Reddit discussion as a secondary confirmation.'
        : index < 5
          ? `${title} is visible on the daily GitHub Trending page.`
          : `${title} is retained as a Repo Radar history follow-up.`,
    matchedTopicIds: ['topic-ai-devtools'],
    matchedRules:
      index === 0
        ? ['repo_growth', 'cross_source_confirmation']
        : index < 5
          ? ['repo_growth', 'daily_github_trending_page']
          : ['repo_growth', 'repo_radar_history'],
    signalScore: Number((0.92 - index * 0.04).toFixed(2)),
    confidence: {
      level: index < 2 ? 'high' : index < 5 ? 'medium' : 'low',
      score: Number((0.88 - index * 0.05).toFixed(2)),
      rationale:
        index === 0
          ? 'GitHub Trending rank is confirmed by a secondary Reddit citation.'
          : index < 5
            ? 'GitHub Trending rank provides a current daily signal.'
            : 'Repo Radar keeps this as historical growth context.',
    },
    confirmedProviderKeys:
      index === 0
        ? ['github-trending-page', 'reddit']
        : [index < 5 ? 'github-trending-page' : 'github-repo-radar'],
    providerMetrics: [
      { label: 'Stars', value: stars },
      {
        label: index < 5 ? 'GitHub Trending today' : 'Repo Radar history',
        value: trend,
      },
    ],
    whyImportant:
      index === 0
        ? ['Cross-source confirmation reduces single-source risk.']
        : [`${title} adds another ranked repository signal for review.`],
    whyNow: 'The signal appeared in the current summary window.',
    canonicalUrl,
    citationIds: [`bc-${index + 1}`],
  }),
);
const topReadCitations = dailyTrendingSeeds.map(
  ([title, canonicalUrl], index) => ({
    citationId: `bc-${index + 1}`,
    feedItemId: `feed-${index < 5 ? 'github-trending-page' : 'github-repo-radar'}-${index + 1}`,
    sourceItemId: `github:${title}`,
    providerKey: index < 5 ? 'github-trending-page' : 'github-repo-radar',
    field: 'canonicalUrl',
    label: `[${index + 1}] ${title}`,
    canonicalUrl,
  }),
);

const summaryArtifact = {
  schemaVersion: 'summary.artifact.v1',
  summaryId,
  tenantId,
  workspaceId,
  topicId: 'topic-ai-devtools',
  userId,
  headline: 'GitHub Trending daily radar',
  executiveSummary:
    'The strongest daily signal comes from github.com/trending, with Repo Radar kept for sustained growth follow-up.',
  keyPoints: [
    {
      claim:
        'GitHub Trending found daily repository signals led by calesthio/OpenMontage.',
      citationIds: ['bc-1'],
    },
  ],
  sourceHighlights: [
    'GitHub Trending page: 5 daily items',
    'Repo Radar: 2 historical follow-ups',
    'Reddit confirms the lead signal',
  ],
  risksAndUnknowns: [],
  citations: topReadCitations.slice(0, 3),
  freshness: {
    status: 'fresh',
    checkedAt,
    newestFeedItemId: 'feed-github-trending-page-1',
    newestObservedAt: endedAt,
  },
  confidence: {
    level: 'medium',
    score: 0.72,
    rationale:
      'GitHub Trending provides the daily repository rank and Reddit confirms the lead signal.',
  },
  qualityFlags: [],
  sourceWindow: {
    windowId: 'workspace:frontend-reader-summary-e2e',
    startedAt,
    endedAt,
    selectedFeedItemIds: topReadCitations.map(
      (citation) => citation.feedItemId,
    ),
  },
  lineage: {
    promptVersion: 'summary.reader.e2e.v1',
    schemaVersion: 'summary.artifact.v1',
    modelVersion: 'deterministic-e2e',
    providerVersion: 'fixture',
    rulesVersion: 'summary.rules.e2e.v1',
    evalDatasetVersion: 'summary-e2e.v1',
  },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  },
};

const defaultReaderSummaryArtifact = {
  schemaVersion: 'reader_summary.artifact.v1',
  readerSummaryId,
  tenantId,
  workspaceId,
  scope: { type: 'workspace' },
  period: {
    cadence: 'daily',
    startedAt: new Date('2026-06-23T00:00:00.000Z'),
    endedAt: new Date('2026-06-24T00:00:00.000Z'),
    timezone: 'UTC',
    periodKey:
      'daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC',
  },
  userId,
  sourceWindow: {
    windowId: 'workspace:frontend-reader-summary-e2e',
    startedAt,
    endedAt,
    selectedFeedItemIds: [
      ...topReadCitations.map((citation) => citation.feedItemId),
      'feed-reddit-codex',
    ],
    storyClusterIds: ['story:codex-growth'],
  },
  storyClusters: [
    {
      id: 'story:codex-growth',
      storyKey: 'repo:github.com/calesthio/OpenMontage',
      representativeFeedItemId: 'feed-github-trending-page-1',
      duplicateFeedItemIds: ['feed-reddit-codex'],
      topicIds: ['topic-ai-devtools'],
      providerKeys: ['github-trending-page', 'reddit'],
      score: 0.92,
      observedAtRange: { startedAt, endedAt },
      whyImportant: ['GitHub trend is confirmed by social discussion.'],
    },
  ],
  contextArtifacts: [],
  headline: 'GitHub Trending daily radar',
  executiveSummary:
    'Review the strongest github.com/trending repositories first, then use Repo Radar for sustained growth history.',
  readerBrief: {
    headline: 'GitHub Trending daily radar',
    oneLineTakeaway:
      'GitHub Trending is the daily radar; Repo Radar is the historical analytics layer for longer windows.',
    bullets: [
      'Best first read: calesthio/OpenMontage - top repository on github.com/trending today.',
      'Repo Radar follow-ups are available for sustained 7d, 30d and 90d growth checks.',
    ],
    qualityState: {
      status: 'ready',
      flags: [],
      warnings: [],
      isSingleSource: false,
    },
    topicSections: [
      {
        topicId: 'topic-ai-devtools',
        title: 'AI devtools',
        insight:
          'Agentic coding tools are the clearest signal in the current monitoring window.',
        citationIds: ['bc-1', 'bc-reddit'],
        items: topReads,
      },
    ],
    sourceMix: [
      {
        providerKey: 'github-trending-page',
        itemCount: 5,
        citationCount: 5,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ['topic-ai-devtools'],
      },
      {
        providerKey: 'github-repo-radar',
        itemCount: 2,
        citationCount: 2,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ['topic-ai-devtools'],
      },
      {
        providerKey: 'reddit',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ['topic-ai-devtools'],
      },
    ],
    topReads,
    trendDelta: {
      newSignals: ['calesthio/OpenMontage'],
      growingSignals: ['AI devtools'],
      repeatedSignals: [],
      fadingSignals: [],
    },
    openQuestions: [
      'Will discussion persist after the initial repo growth spike?',
    ],
    risks: ['GitHub stars measure attention, not production adoption.'],
    nextActions: [
      {
        kind: 'read_source',
        label: 'Read source',
        reason: 'Open the canonical GitHub source.',
        citationIds: ['bc-1'],
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      },
      {
        kind: 'mark_relevant',
        label: 'Mark relevant',
        reason: 'Tune future summaries toward this signal.',
        citationIds: ['bc-1', 'bc-reddit'],
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      },
      {
        kind: 'watch_repository',
        label: 'Watch repository',
        reason: 'Requires a repository-watch backend workflow.',
        citationIds: ['bc-1'],
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      },
    ],
  },
  topStories: [
    {
      storyClusterId: 'story:codex-growth',
      title: 'calesthio/OpenMontage tops daily GitHub Trending',
      summary:
        'Daily GitHub Trending rank and Reddit discussion point to active interest in agentic video production tooling.',
      topicIds: ['topic-ai-devtools'],
      providerKeys: ['github-trending-page', 'reddit'],
      citationIds: ['bc-1', 'bc-reddit'],
    },
  ],
  topicHighlights: [
    {
      topicId: 'topic-ai-devtools',
      title: 'AI devtools',
      summary:
        'Agentic coding tools are driving the strongest monitored signal.',
      citationIds: ['bc-1', 'bc-reddit'],
    },
  ],
  repeatedSignals: [],
  risksAndUnknowns: [
    {
      description: 'GitHub stars measure attention, not production adoption.',
      citationIds: ['bc-1'],
      reason: 'source_limit',
    },
  ],
  citations: [
    ...topReadCitations,
    {
      citationId: 'bc-reddit',
      feedItemId: 'feed-reddit-codex',
      sourceItemId: 'reddit:codex-discussion',
      providerKey: 'reddit',
      field: 'bodyPreview',
      label: 'Reddit discussion confirms operator interest',
      canonicalUrl: 'https://reddit.example/r/LocalLLaMA/comments/codex',
    },
  ],
  freshness: {
    status: 'fresh',
    checkedAt,
    newestFeedItemId: 'feed-github-trending-page-1',
    newestObservedAt: endedAt,
  },
  qualityFlags: [],
  confidence: {
    level: 'medium',
    score: 0.72,
    rationale: 'Two source families agree on the same lead story cluster.',
  },
  lineage: {
    promptVersion: 'readerSummary.reader.e2e.v1',
    schemaVersion: 'reader_summary.artifact.v1',
    modelVersion: 'deterministic-e2e',
    providerVersion: 'fixture',
    rulesVersion: 'reader_summary.rules.e2e.v1',
    evalDatasetVersion: 'reader-summary-e2e.v1',
  },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  },
};

const readerSummaryArtifact =
  loadFrontendFixtureReaderSummaryArtifact() ?? defaultReaderSummaryArtifact;
const servedReaderSummaryId =
  typeof readerSummaryArtifact.readerSummaryId === 'string'
    ? readerSummaryArtifact.readerSummaryId
    : readerSummaryId;

function loadFrontendFixtureReaderSummaryArtifact(): JsonObject | null {
  const fixturePath = process.env.FRONTEND_READER_SUMMARY_FIXTURE_PATH?.trim();
  if (fixturePath === undefined || fixturePath.length === 0) {
    return null;
  }
  if (!existsSync(fixturePath)) {
    throw new Error(
      `FRONTEND_READER_SUMMARY_FIXTURE_PATH does not exist: ${fixturePath}`,
    );
  }

  const parsed = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  if (!isJsonObject(parsed) || !isJsonObject(parsed.readerSummaryArtifact)) {
    throw new Error(
      'FRONTEND_READER_SUMMARY_FIXTURE_PATH must contain readerSummaryArtifact object',
    );
  }
  if (typeof parsed.readerSummaryArtifact.readerSummaryId !== 'string') {
    throw new Error('readerSummaryArtifact.readerSummaryId must be a string');
  }

  return normalizeReaderSummaryArtifactForGeneratedApi(
    parsed.readerSummaryArtifact,
  );
}

function normalizeReaderSummaryArtifactForGeneratedApi(
  artifact: JsonObject,
): JsonObject {
  if (isJsonObject(artifact.readerBrief)) {
    return artifact;
  }
  if (!isJsonObject(artifact.content)) {
    return artifact;
  }

  return {
    ...artifact,
    readerBrief: artifact.content,
  };
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    sendJson(response, 500, { error: 'internal_error' });
  });
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/summaries') {
    sendJson(response, 200, { items: [summaryArtifact], nextCursor: null });
    return;
  }

  if (request.method === 'GET' && url.pathname === `/summaries/${summaryId}`) {
    sendJson(response, 200, summaryArtifact);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/reader-summaries') {
    sendJson(response, 200, { items: [readerSummaryArtifact], nextCursor: null });
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === `/reader-summaries/${servedReaderSummaryId}`
  ) {
    sendJson(response, 200, readerSummaryArtifact);
    return;
  }

  if (
    request.method === 'POST' &&
    url.pathname === `/relevance/users/${userId}/feedback`
  ) {
    const body = await readJsonBody(request);
    const signal = buildFeedbackSignal(body);
    feedbackSignals.push({
      action: signal.action,
      bodyPreview:
        typeof body.bodyPreview === 'string' ? body.bodyPreview : null,
      canonicalUrl:
        typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null,
      idempotencyKey: firstHeaderValue(request.headers['idempotency-key']),
      providerKey: signal.target.providerKey,
      rating: signal.rating,
      title: typeof body.title === 'string' ? body.title : null,
      topicId: signal.target.topicId,
    });
    sendJson(response, 201, {
      created: true,
      feedback: signal,
      learningDirection: 'positive',
      profile: {
        id: 'profile-frontend-reader-summary-e2e',
        userId,
        topicWeights: [],
        sourceWeights: [],
        keywordWeights: [],
        blockedProviderKeys: [],
        mutedKeywords: [],
        rulesVersion: 'reader-summary-e2e.v1',
        updatedAt: checkedAt,
      },
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/__e2e/reader-feedback') {
    sendJson(response, 200, {
      count: feedbackSignals.length,
      items: feedbackSignals,
    });
    return;
  }

  sendJson(response, 404, { error: 'not_found', path: url.pathname });
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function buildFeedbackSignal(body: JsonObject): FeedbackSignal {
  const action =
    typeof body.action === 'string' ? body.action : 'more_like_this';
  const target = isJsonObject(body.target) ? body.target : {};

  return {
    feedbackId: randomUUID(),
    userId,
    action,
    rating: typeof body.rating === 'number' ? body.rating : null,
    target: {
      feedItemId:
        typeof target.feedItemId === 'string' ? target.feedItemId : null,
      providerKey:
        typeof target.providerKey === 'string'
          ? target.providerKey
          : 'github-trending-page',
      topicId:
        typeof target.topicId === 'string'
          ? target.topicId
          : 'topic-ai-devtools',
    },
    createdAt: checkedAt,
  };
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }

  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return isJsonObject(parsed) ? parsed : {};
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  response.setHeader(
    'access-control-allow-headers',
    'authorization,content-type,idempotency-key,x-correlation-id,x-tenant-id,x-workspace-id,x-workspace-role',
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

const requestedPort = Number.parseInt(
  process.env.FRONTEND_READER_SUMMARY_E2E_PORT ?? '0',
  10,
);
const listenPort =
  Number.isInteger(requestedPort) && requestedPort >= 0 ? requestedPort : 0;

server.listen(listenPort, '127.0.0.1', () => {
  const address = server.address();
  const port =
    typeof address === 'object' && address !== null ? address.port : 0;
  console.log(
    JSON.stringify({
      status: 'ready',
      apiBaseUrl: `http://127.0.0.1:${port}`,
      tenantId,
      workspaceId,
      userId,
      readerSummaryId: servedReaderSummaryId,
      diagnosticsUrl: `http://127.0.0.1:${port}/__e2e/reader-feedback`,
    }),
  );
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
