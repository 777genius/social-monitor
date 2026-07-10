import { emptyJsonObjectAsUndefined, normalizeJsonObject, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem, type FeedItemProps } from '../../../domain';
export { normalizeFeedCanonicalUrl } from '../feed-dedupe-key';

export type PrismaFeedItemRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly dedupeKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly authorHandle: string | null;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly status: 'VISIBLE' | 'HIDDEN' | 'TOMBSTONED';
  readonly createdAt: Date;
  readonly providerMetadata: unknown | null;
  readonly sourceItem?: {
    readonly body: string;
  };
};

export const feedItemFromPrisma = (record: PrismaFeedItemRecord): FeedItem =>
  FeedItem.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    interestId: record.interestId,
    sourceItemId: record.sourceItemId,
    sourceBindingId: record.sourceBindingId,
    providerKey: record.providerKey,
    canonicalUrl: record.canonicalUrl,
    title: record.title,
    bodyPreview: record.bodyPreview,
    authorHandle: record.authorHandle ?? undefined,
    publishedAt: record.publishedAt,
    observedAt: record.observedAt,
    providerMetadata: emptyJsonObjectAsUndefined(normalizeJsonObject(record.providerMetadata)),
  } satisfies FeedItemProps);

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
