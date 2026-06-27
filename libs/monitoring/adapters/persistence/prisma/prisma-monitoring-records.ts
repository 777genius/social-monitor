import { normalizeJsonObject, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  ScanJob,
  type ScanJobProps,
  type ScanJobStatus,
  ScanPolicy,
  type ScanPolicyProps,
  SourceBinding,
  type SourceBindingProps,
  type SourceBindingStatus,
  SourceCredential,
  type SourceCredentialKind,
  type SourceCredentialProps,
  type SourceCredentialStatus,
  Topic,
  type TopicProps,
} from '../../../domain';
import type {
  ScanSchedulerDecisionReason,
  ScanSchedulerDecisionRecord,
} from '../../../ports';

export type PrismaTopicRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly query: string;
  readonly status?: 'ENABLED' | 'DISABLED' | 'ARCHIVED';
  readonly createdAt: Date;
  readonly deletedAt?: Date | null;
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

export type PrismaSourceCredentialRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly providerKey: string;
  readonly kind: 'OAUTH2' | 'API_TOKEN' | 'BEARER_TOKEN' | 'APP_OAUTH';
  readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly secretKeyId: string;
  readonly secretPreview: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly rotatedAt: Date | null;
  readonly revokedAt: Date | null;
};

export type PrismaSourceCredentialSecretRecord = {
  readonly id: string;
  readonly algorithm: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaSourceCredentialSecretWriteData = {
  readonly algorithm: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
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
  readonly failureMetadata: unknown;
  readonly createdAt: Date;
};

export type PrismaScanSchedulerDecisionRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly decisionKey: string;
  readonly scanPolicyId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string | null;
  readonly decision: 'enqueued' | 'skipped';
  readonly reason: string;
  readonly scanJobId: string | null;
  readonly policyDueAt: Date;
  readonly evaluatedAt: Date;
  readonly nextRunAt: Date;
  readonly configuredIntervalSeconds: number;
  readonly effectiveIntervalSeconds: number | null;
  readonly freshnessSeconds: number | null;
  readonly providerMinimumIntervalEnforced: boolean | null;
  readonly backoffUntil: Date | null;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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

export type PrismaIdempotencyKeyRecord = {
  readonly id: string;
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly scope: string;
  readonly key: string;
  readonly requestHash: string | null;
  readonly responseStatus: number | null;
  readonly responsePayload: unknown;
  readonly expiresAt: Date | null;
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

export const sourceCredentialFromPrisma = (record: PrismaSourceCredentialRecord): SourceCredential =>
  SourceCredential.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    providerKey: record.providerKey,
    kind: sourceCredentialKindFromPrisma(record.kind),
    status: sourceCredentialStatusFromPrisma(record.status),
    secretKeyId: record.secretKeyId,
    secretPreview: record.secretPreview,
    scopes: record.scopes,
    expiresAt: record.expiresAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    rotatedAt: record.rotatedAt ?? undefined,
    revokedAt: record.revokedAt ?? undefined,
  } satisfies SourceCredentialProps);

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
    failureMetadata: normalizeJsonObject(record.failureMetadata),
  } satisfies ScanJobProps);

export const scanSchedulerDecisionFromPrisma = (
  record: PrismaScanSchedulerDecisionRecord,
): ScanSchedulerDecisionRecord => ({
  id: record.id,
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  decisionKey: record.decisionKey,
  scanPolicyId: record.scanPolicyId,
  sourceBindingId: record.sourceBindingId,
  ...(record.providerKey === null ? {} : { providerKey: record.providerKey }),
  decision: record.decision,
  reason: scanSchedulerDecisionReasonFromPrisma(record.reason),
  ...(record.scanJobId === null ? {} : { scanJobId: record.scanJobId }),
  policyDueAt: record.policyDueAt,
  evaluatedAt: record.evaluatedAt,
  nextRunAt: record.nextRunAt,
  configuredIntervalSeconds: record.configuredIntervalSeconds,
  ...(record.effectiveIntervalSeconds === null ? {} : { effectiveIntervalSeconds: record.effectiveIntervalSeconds }),
  ...(record.freshnessSeconds === null ? {} : { freshnessSeconds: record.freshnessSeconds }),
  ...(record.providerMinimumIntervalEnforced === null
    ? {}
    : { providerMinimumIntervalEnforced: record.providerMinimumIntervalEnforced }),
  ...(record.backoffUntil === null ? {} : { backoffUntil: record.backoffUntil }),
  ...(record.correlationId === null ? {} : { correlationId: record.correlationId }),
  ...(record.causationId === null ? {} : { causationId: record.causationId }),
});

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

export const sourceCredentialKindToPrisma = (
  kind: SourceCredentialKind,
): PrismaSourceCredentialRecord['kind'] => {
  if (kind === 'oauth2') {
    return 'OAUTH2';
  }
  if (kind === 'api_token') {
    return 'API_TOKEN';
  }
  if (kind === 'bearer_token') {
    return 'BEARER_TOKEN';
  }

  return 'APP_OAUTH';
};

export const sourceCredentialStatusToPrisma = (
  status: SourceCredentialStatus,
): PrismaSourceCredentialRecord['status'] => {
  if (status === 'active') {
    return 'ACTIVE';
  }
  if (status === 'revoked') {
    return 'REVOKED';
  }

  return 'EXPIRED';
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

const sourceCredentialKindFromPrisma = (kind: PrismaSourceCredentialRecord['kind']): SourceCredentialKind => {
  if (kind === 'OAUTH2') {
    return 'oauth2';
  }
  if (kind === 'API_TOKEN') {
    return 'api_token';
  }
  if (kind === 'BEARER_TOKEN') {
    return 'bearer_token';
  }

  return 'app_oauth';
};

const sourceCredentialStatusFromPrisma = (
  status: PrismaSourceCredentialRecord['status'],
): SourceCredentialStatus => {
  if (status === 'ACTIVE') {
    return 'active';
  }
  if (status === 'REVOKED') {
    return 'revoked';
  }

  return 'expired';
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

const scanSchedulerDecisionReasonFromPrisma = (reason: string): ScanSchedulerDecisionReason => {
  if (
    reason === 'scan_policy_due_now' ||
    reason === 'active_scan' ||
    reason === 'duplicate_window' ||
    reason === 'fresh_success' ||
    reason === 'provider_failure_backoff' ||
    reason === 'queue_backpressure' ||
    reason === 'rate_limit_backoff' ||
    reason === 'source_unavailable'
  ) {
    return reason;
  }

  throw new Error(`Cannot rehydrate unsupported scan scheduler decision reason "${reason}"`);
};

const normalizeRecordObject = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  return {};
};
