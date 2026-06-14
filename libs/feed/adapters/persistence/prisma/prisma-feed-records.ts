import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem, type FeedItemProps } from '../../../domain';

export type PrismaFeedItemRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly topicId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly dedupeKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly authorHandle: string | null;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly status: 'VISIBLE' | 'HIDDEN' | 'TOMBSTONED';
  readonly createdAt: Date;
};

export const feedItemFromPrisma = (record: PrismaFeedItemRecord): FeedItem =>
  FeedItem.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    topicId: record.topicId,
    sourceItemId: record.sourceItemId,
    sourceBindingId: record.sourceBindingId,
    canonicalUrl: record.canonicalUrl,
    title: record.title,
    bodyPreview: record.bodyPreview,
    authorHandle: record.authorHandle ?? undefined,
    publishedAt: record.publishedAt,
    observedAt: record.observedAt,
  } satisfies FeedItemProps);

export const normalizeFeedCanonicalUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLocaleLowerCase('en-US');

    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLocaleLowerCase('en-US').startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
        parsed.searchParams.delete(key);
      }
    }

    parsed.searchParams.sort();

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
    }

    return parsed.toString();
  } catch {
    return value.trim().toLocaleLowerCase('en-US');
  }
};

export const encodeFeedCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString('base64url');

export const parseFeedCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
