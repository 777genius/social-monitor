import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
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

export const sourceBindingStatusToPrisma = (status: SourceBindingStatus): 'ENABLED' | 'PAUSED' =>
  status === 'enabled' ? 'ENABLED' : 'PAUSED';

const sourceBindingStatusFromPrisma = (status: PrismaSourceBindingRecord['status']): SourceBindingStatus => {
  if (status === 'ENABLED') {
    return 'enabled';
  }

  if (status === 'PAUSED') {
    return 'paused';
  }

  throw new Error(`Cannot rehydrate unsupported source binding status "${status}"`);
};

const normalizeRecordObject = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  return {};
};
