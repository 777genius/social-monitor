import { createHash } from 'node:crypto';

import { normalizeJsonObject, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  ScanAttempt,
  type ScanAttemptProps,
  type ScanAttemptStatus,
  SourceItem,
  type SourceItemProps,
} from '../../../domain';
import type { FailedScanCommand, ScanCursorRecord, ScanLease, SourceQuery, SourceQueryMode } from '../../../ports';

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
  readonly metadata: unknown;
};

export type PrismaCursorCheckpointRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly cursorPayload: unknown;
  readonly updatedAt: Date;
};

export type PrismaScanFailureQueueStatus = 'RETRY_ENQUEUED' | 'DEAD_LETTERED';

export type PrismaScanFailureQueueEntryRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scanJobId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: string;
  readonly sourceQuery: unknown;
  readonly correlationId: string;
  readonly causationId: string;
  readonly attemptNumber: number;
  readonly retryBudget: number;
  readonly nextAttemptNumber: number | null;
  readonly failureReason: string;
  readonly status: PrismaScanFailureQueueStatus;
  readonly createdAt: Date;
};

export type PrismaScanAttemptStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export type PrismaScanAttemptRecord = {
  readonly scanJobId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly status: PrismaScanAttemptStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly failureReason: string | null;
};

export type PrismaScanLeaseEntryRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scanJobId: string;
  readonly workerId: string;
  readonly fencingToken: string;
  readonly leasedAt: Date;
  readonly expiresAt: Date;
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
    metadata: normalizeJsonObject(record.metadata),
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

export const failedScanCommandFromPrisma = (
  record: PrismaScanFailureQueueEntryRecord,
): FailedScanCommand => ({
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  scanJobId: record.scanJobId,
  interestId: record.interestId,
  sourceBindingId: record.sourceBindingId,
  scanPolicyId: record.scanPolicyId,
  providerKey: record.providerKey,
  sourceQuery: sourceQueryFromPrisma(record.sourceQuery),
  correlationId: record.correlationId,
  causationId: record.causationId,
  attemptNumber: record.attemptNumber,
  retryBudget: record.retryBudget,
  failureReason: record.failureReason,
});

const sourceQueryModes: readonly SourceQueryMode[] = ['search', 'listing', 'account_feed', 'thread', 'url'];

const sourceQueryFromPrisma = (value: unknown): SourceQuery => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Scan failure source query must be an object');
  }

  const payload = value as Readonly<Record<string, unknown>>;

  if (typeof payload.mode !== 'string' || !sourceQueryModes.includes(payload.mode as SourceQueryMode)) {
    throw new Error('Scan failure source query mode is unsupported');
  }

  if (typeof payload.query !== 'string' || payload.query.trim().length === 0) {
    throw new Error('Scan failure source query must be non-empty');
  }

  return {
    mode: payload.mode as SourceQueryMode,
    query: payload.query.trim(),
  };
};

export const scanAttemptFromPrisma = (record: PrismaScanAttemptRecord): ScanAttempt =>
  ScanAttempt.rehydrate({
    scanJobId: record.scanJobId,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    sourceBindingId: record.sourceBindingId,
    status: scanAttemptStatusFromPrisma(record.status),
    startedAt: record.startedAt,
    finishedAt: record.finishedAt ?? undefined,
    fetched: record.fetched,
    inserted: record.inserted,
    skippedDuplicates: record.skippedDuplicates,
    projected: record.projected,
    failureReason: record.failureReason ?? undefined,
  } satisfies ScanAttemptProps);

export const scanAttemptStatusToPrisma = (status: ScanAttemptStatus): PrismaScanAttemptStatus => {
  if (status === 'running') {
    return 'RUNNING';
  }

  if (status === 'succeeded') {
    return 'SUCCEEDED';
  }

  return 'FAILED';
};

export const scanLeaseFromPrisma = (record: PrismaScanLeaseEntryRecord): ScanLease => ({
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  scanJobId: record.scanJobId,
  workerId: record.workerId,
  fencingToken: record.fencingToken,
  leasedAt: record.leasedAt,
  expiresAt: record.expiresAt,
});

const scanAttemptStatusFromPrisma = (status: PrismaScanAttemptStatus): ScanAttemptStatus => {
  if (status === 'RUNNING') {
    return 'running';
  }

  if (status === 'SUCCEEDED') {
    return 'succeeded';
  }

  return 'failed';
};

const normalizeCursorPayload = (payload: unknown): { readonly cursor: string } | null => {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const cursor = (payload as { readonly cursor?: unknown }).cursor;

    if (typeof cursor === 'string' && cursor.trim().length > 0) {
      return { cursor };
    }
  }

  return null;
};
