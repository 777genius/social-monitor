import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  DigestCandidateFeedItem,
  DigestCandidateSummary,
  DigestSourceReaderPort,
  DigestSourceWindowQuery,
  DigestSourceWindowResult,
} from '../../../ports';
import type {
  PrismaDeliveryClient,
  PrismaDigestSourceSummaryStatus,
} from '../../persistence/prisma/prisma-delivery-client';
import type {
  PrismaDigestSourceFeedItemRecord,
  PrismaDigestSourceSummaryRecord,
} from '../../persistence/prisma/prisma-delivery-records';

const MAX_SUMMARY_SCAN = 500;
const MAX_FEED_ITEMS = 500;

export class PrismaDigestSourceReader implements DigestSourceReaderPort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async readWindow(query: DigestSourceWindowQuery): Promise<DigestSourceWindowResult> {
    const interestIds = uniqueSorted(query.interestIds);

    if (interestIds.length === 0) {
      return {
        summaries: [],
        feedItems: [],
      };
    }

    const [summaryRecords, feedItemRecords] = await Promise.all([
      this.prisma.summaryArtifact.findMany({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          interestId: { in: interestIds },
          status: { in: ['COMPLETED', 'NO_SIGNAL'] satisfies readonly PrismaDigestSourceSummaryStatus[] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_SUMMARY_SCAN,
      }),
      this.prisma.feedItem.findMany({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          interestId: { in: interestIds },
          status: 'VISIBLE',
          observedAt: {
            gte: query.startedAt,
            lt: query.endedAt,
          },
        },
        orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
        take: MAX_FEED_ITEMS,
      }),
    ]);

    return {
      summaries: summaryRecords
        .map((record) => summaryCandidateFromPrisma(record))
        .filter((summary) => summary !== null)
        .filter((summary) => isWithinWindow(summary.sourceWindowEndedAt, query))
        .sort((left, right) => left.summaryId.localeCompare(right.summaryId)),
      feedItems: feedItemRecords
        .map((record) => feedItemCandidateFromPrisma(record))
        .sort((left, right) => left.feedItemId.localeCompare(right.feedItemId)),
    };
  }
}

const summaryCandidateFromPrisma = (record: PrismaDigestSourceSummaryRecord): DigestCandidateSummary | null => {
  const payload = normalizeObject(record.artifactPayload);

  if (payload === null) {
    return null;
  }

  const sourceWindow = normalizeObject(payload.sourceWindow);

  if (sourceWindow === null) {
    return null;
  }

  const sourceWindowStartedAt = parseDate(sourceWindow.startedAt);
  const sourceWindowEndedAt = parseDate(sourceWindow.endedAt);

  if (sourceWindowStartedAt === null || sourceWindowEndedAt === null) {
    return null;
  }

  return {
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    summaryId: record.id,
    interestId: record.interestId,
    sourceWindowStartedAt,
    sourceWindowEndedAt,
    signal: summarySignal(record),
  };
};

const feedItemCandidateFromPrisma = (record: PrismaDigestSourceFeedItemRecord): DigestCandidateFeedItem => ({
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  feedItemId: record.id,
  interestId: record.interestId,
  observedAt: record.observedAt,
  signal: 'normal',
});

const summarySignal = (record: PrismaDigestSourceSummaryRecord): DigestCandidateSummary['signal'] => {
  if (record.status === 'NO_SIGNAL') {
    return 'no_signal';
  }

  const qualitySignals = normalizeObject(record.qualitySignals);
  const qualityFlags = Array.isArray(qualitySignals?.qualityFlags)
    ? qualitySignals.qualityFlags
    : [];

  if (qualityFlags.includes('no_signal')) {
    return 'no_signal';
  }

  const confidence = normalizeObject(qualitySignals?.confidence);

  if (confidence?.level === 'high') {
    return 'high';
  }

  if (confidence?.level === 'low' || qualityFlags.includes('low_confidence')) {
    return 'low';
  }

  return 'normal';
};

const normalizeObject = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;

const parseDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWithinWindow = (timestamp: Date, query: DigestSourceWindowQuery): boolean =>
  timestamp.getTime() >= query.startedAt.getTime() && timestamp.getTime() < query.endedAt.getTime();

const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));
