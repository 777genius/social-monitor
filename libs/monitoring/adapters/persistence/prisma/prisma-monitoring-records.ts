import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  ScanJob,
  type ScanJobProps,
  type ScanJobStatus,
  ScanPolicy,
  type ScanPolicyProps,
  SourceBinding,
  type SourceBindingProps,
  type SourceBindingStatus,
  Topic,
  type TopicProps,
} from '../../../domain';

export type PrismaTopicRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly query: string;
  readonly createdAt: Date;
};

export type PrismaSourceBindingRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly topicId: string;
  readonly sourceCatalogEntryId: string;
  readonly capabilityProfileVersion: number;
  readonly status: 'DRAFT' | 'ENABLED' | 'PAUSED' | 'FAILED';
  readonly config: unknown;
  readonly createdAt: Date;
};

export type PrismaSourceCatalogEntryRecord = {
  readonly id: string;
  readonly providerKey: string;
};

export type PrismaScanPolicyRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly retryBudget: number;
  readonly nextRunAt: Date;
  readonly createdAt: Date;
};

export type PrismaScanJobRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: 'REQUESTED' | 'ENQUEUED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly enqueuedAt: Date | null;
  readonly completedAt: Date | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
};

export type PrismaScanAttemptRecord = {
  readonly scanJobId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly failureReason: string | null;
};

export type PrismaOutboxEventRecord = {
  readonly id: string;
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly payload: unknown;
  readonly status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
};

export const topicFromPrisma = (record: PrismaTopicRecord): Topic =>
  Topic.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    name: record.name,
    query: record.query,
    createdAt: record.createdAt,
  } satisfies TopicProps);

export const sourceBindingFromPrisma = (
  record: PrismaSourceBindingRecord,
  catalogEntry: PrismaSourceCatalogEntryRecord,
): SourceBinding =>
  SourceBinding.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    topicId: record.topicId,
    providerKey: catalogEntry.providerKey,
    capabilityProfileVersion: record.capabilityProfileVersion,
    config: normalizeRecordObject(record.config),
    status: sourceBindingStatusFromPrisma(record.status),
    createdAt: record.createdAt,
  } satisfies SourceBindingProps);

export const scanPolicyFromPrisma = (record: PrismaScanPolicyRecord): ScanPolicy =>
  ScanPolicy.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    sourceBindingId: record.sourceBindingId,
    intervalSeconds: record.intervalSeconds,
    freshnessSeconds: record.freshnessSeconds,
    retryBudget: record.retryBudget,
    nextRunAt: record.nextRunAt,
    createdAt: record.createdAt,
  } satisfies ScanPolicyProps);

export const scanJobFromPrisma = (record: PrismaScanJobRecord): ScanJob =>
  ScanJob.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    sourceBindingId: record.sourceBindingId,
    scanPolicyId: record.scanPolicyId,
    status: scanJobStatusFromPrisma(record.status),
    idempotencyKey: record.idempotencyKey,
    requestedAt: record.requestedAt,
    enqueuedAt: record.enqueuedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    failureReason: record.failureReason ?? undefined,
  } satisfies ScanJobProps);

export const sourceBindingStatusToPrisma = (status: SourceBindingStatus): 'ENABLED' | 'PAUSED' =>
  status === 'enabled' ? 'ENABLED' : 'PAUSED';

export const scanJobStatusToPrisma = (
  status: ScanJobStatus,
): 'REQUESTED' | 'ENQUEUED' | 'SUCCEEDED' | 'FAILED' => {
  if (status === 'requested') {
    return 'REQUESTED';
  }

  if (status === 'enqueued') {
    return 'ENQUEUED';
  }

  if (status === 'succeeded') {
    return 'SUCCEEDED';
  }

  return 'FAILED';
};

const sourceBindingStatusFromPrisma = (status: PrismaSourceBindingRecord['status']): SourceBindingStatus => {
  if (status === 'ENABLED') {
    return 'enabled';
  }

  if (status === 'PAUSED') {
    return 'paused';
  }

  throw new Error(`Cannot rehydrate unsupported source binding status "${status}"`);
};

const scanJobStatusFromPrisma = (status: PrismaScanJobRecord['status']): ScanJobStatus => {
  if (status === 'REQUESTED') {
    return 'requested';
  }

  if (status === 'ENQUEUED') {
    return 'enqueued';
  }

  if (status === 'SUCCEEDED') {
    return 'succeeded';
  }

  if (status === 'FAILED') {
    return 'failed';
  }

  throw new Error(`Cannot rehydrate unsupported scan job status "${status}"`);
};

const normalizeRecordObject = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  return {};
};
