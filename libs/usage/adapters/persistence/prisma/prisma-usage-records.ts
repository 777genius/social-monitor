import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  PublicApiAuditMetadataValue,
  PublicApiAuditOutcome,
  PublicApiAuditActorType,
  PublicApiAuditRecord,
} from '../../../ports';

export type PrismaPublicApiAuditEventRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly actorType: PublicApiAuditActorType;
  readonly actorId: string;
  readonly action: string;
  readonly outcome: PublicApiAuditOutcome;
  readonly reasonCode: string | null;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly metadata: unknown;
  readonly occurredAt: Date;
};

export type PrismaRateLimitBucketRecord = {
  readonly bucketKey: string;
  readonly windowStartedAt: Date;
  readonly windowEndsAt: Date;
  readonly count: number;
};

export type PrismaUsageQuotaBucketRecord = {
  readonly bucketKey: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly subjectKey: string;
  readonly operation: string;
  readonly windowStartedAt: Date;
  readonly windowEndsAt: Date;
  readonly consumed: number;
  readonly limit: number;
};

export const publicApiAuditRecordFromPrisma = (
  record: PrismaPublicApiAuditEventRecord,
): PublicApiAuditRecord => ({
  id: record.id,
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  actorType: record.actorType,
  actorId: record.actorId,
  action: record.action,
  outcome: record.outcome,
  reasonCode: record.reasonCode ?? undefined,
  resourceType: record.resourceType,
  resourceId: record.resourceId ?? undefined,
  metadata: normalizeAuditMetadata(record.metadata),
  occurredAt: record.occurredAt,
});

const normalizeAuditMetadata = (
  metadata: unknown,
): Readonly<Record<string, PublicApiAuditMetadataValue>> => {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata as Readonly<Record<string, unknown>>)
      .map(([key, value]) => [key, normalizeAuditMetadataValue(value)] as const)
      .filter((entry): entry is readonly [string, PublicApiAuditMetadataValue] => entry[1] !== undefined),
  );
};

const normalizeAuditMetadataValue = (value: unknown): PublicApiAuditMetadataValue => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }

  return undefined;
};
