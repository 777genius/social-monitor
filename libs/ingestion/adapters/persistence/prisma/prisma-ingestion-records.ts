import { createHash } from 'node:crypto';

import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceItem, type SourceItemProps } from '../../../domain';
import type { ScanCursorRecord } from '../../../ports';

export type PrismaSourceItemRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly providerItemId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle: string | null;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly createdAt: Date;
};

export type PrismaCursorCheckpointRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly cursorPayload: unknown;
  readonly updatedAt: Date;
};

export const sourceItemFromPrisma = (record: PrismaSourceItemRecord): SourceItem =>
  SourceItem.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    sourceBindingId: record.sourceBindingId,
    externalId: record.providerItemId,
    canonicalUrl: record.canonicalUrl,
    title: record.title,
    body: record.body,
    authorHandle: record.authorHandle ?? undefined,
    publishedAt: record.publishedAt,
    ingestedAt: record.observedAt,
  } satisfies SourceItemProps);

export const cursorFromPrisma = (record: PrismaCursorCheckpointRecord): ScanCursorRecord | null => {
  const payload = normalizeCursorPayload(record.cursorPayload);

  if (payload === null) {
    return null;
  }

  return {
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    sourceBindingId: record.sourceBindingId,
    cursor: payload.cursor,
    committedAt: record.updatedAt,
  };
};

export const contentHashForSourceItem = (snapshot: SourceItemProps): string =>
  createHash('sha256')
    .update([
      snapshot.sourceBindingId,
      snapshot.externalId,
      snapshot.canonicalUrl,
      snapshot.title,
      snapshot.body,
      snapshot.authorHandle ?? '',
      snapshot.publishedAt.toISOString(),
    ].join('\u001f'))
    .digest('hex');

const normalizeCursorPayload = (payload: unknown): { readonly cursor: string } | null => {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const cursor = (payload as { readonly cursor?: unknown }).cursor;

    if (typeof cursor === 'string' && cursor.trim().length > 0) {
      return { cursor };
    }
  }

  return null;
};
