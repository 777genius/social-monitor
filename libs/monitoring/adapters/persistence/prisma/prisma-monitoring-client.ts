import type {
  PrismaIdempotencyKeyRecord,
  PrismaScanJobRecord,
  PrismaOutboxEventRecord,
  PrismaScanAttemptRecord,
  PrismaScanPolicyRecord,
  PrismaScanSchedulerDecisionRecord,
  PrismaSourceBindingRecord,
  PrismaSourceCatalogEntryRecord,
  PrismaSourceCredentialRecord,
  PrismaSourceCredentialSecretRecord,
  PrismaSourceCredentialSecretWriteData,
  PrismaTopicRecord,
} from './prisma-monitoring-records';

type PrismaScanSchedulerDecisionWriteData = {
  readonly providerKey?: string | null;
  readonly decision: PrismaScanSchedulerDecisionRecord['decision'];
  readonly reason: string;
  readonly scanJobId?: string | null;
  readonly policyDueAt: Date;
  readonly evaluatedAt: Date;
  readonly nextRunAt: Date;
  readonly configuredIntervalSeconds: number;
  readonly effectiveIntervalSeconds?: number | null;
  readonly freshnessSeconds?: number | null;
  readonly providerMinimumIntervalEnforced?: boolean | null;
  readonly backoffUntil?: Date | null;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;
};

type PrismaTopicStatus = 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export type PrismaMonitoringClient = {
  readonly topic: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly name: string;
        readonly query: string;
        readonly status?: PrismaTopicStatus;
        readonly deletedAt?: Date | null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly name: string;
        readonly query: string;
        readonly status?: PrismaTopicStatus;
        readonly deletedAt?: Date | null;
      };
    }): Promise<PrismaTopicRecord>;
    updateMany(args: {
      readonly where: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly deletedAt: null;
      };
      readonly data: {
        readonly status: PrismaTopicStatus;
        readonly deletedAt: Date;
      };
    }): Promise<unknown>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly name?: string;
        readonly id?: string;
        readonly deletedAt: null;
      };
    }): Promise<PrismaTopicRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly deletedAt: null;
      };
      readonly orderBy: readonly [
        { readonly createdAt: 'desc' },
        { readonly id: 'desc' },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaTopicRecord[]>;
  };
  readonly sourceCatalogEntry: {
    findUnique(args: {
      readonly where: { readonly providerKey?: string; readonly id?: string };
    }): Promise<PrismaSourceCatalogEntryRecord | null>;
  };
  readonly sourceBinding: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly capabilityProfileVersion: number;
        readonly status: 'ENABLED' | 'PAUSED';
        readonly config: Readonly<Record<string, unknown>>;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId: string;
        readonly sourceCatalogEntryId: string;
        readonly capabilityProfileVersion: number;
        readonly status: 'ENABLED' | 'PAUSED';
        readonly config: Readonly<Record<string, unknown>>;
      };
    }): Promise<PrismaSourceBindingRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId?: string;
        readonly id?: string;
        readonly sourceCatalogEntryId?: string;
        readonly deletedAt: null;
      };
    }): Promise<PrismaSourceBindingRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId: string;
        readonly deletedAt: null;
      };
      readonly orderBy: readonly [
        { readonly createdAt: 'desc' },
        { readonly id: 'desc' },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaSourceBindingRecord[]>;
  };
  readonly sourceCredential: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly kind: PrismaSourceCredentialRecord['kind'];
        readonly status: PrismaSourceCredentialRecord['status'];
        readonly secretKeyId: string;
        readonly secretPreview: string;
        readonly scopes: readonly string[];
        readonly expiresAt?: Date | null;
        readonly rotatedAt?: Date | null;
        readonly revokedAt?: Date | null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly providerKey: string;
        readonly kind: PrismaSourceCredentialRecord['kind'];
        readonly status: PrismaSourceCredentialRecord['status'];
        readonly secretKeyId: string;
        readonly secretPreview: string;
        readonly scopes: readonly string[];
        readonly expiresAt?: Date | null;
        readonly rotatedAt?: Date | null;
        readonly revokedAt?: Date | null;
        readonly createdAt: Date;
        readonly updatedAt: Date;
      };
    }): Promise<PrismaSourceCredentialRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly providerKey?: string;
      };
    }): Promise<PrismaSourceCredentialRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly providerKey?: string;
      };
      readonly orderBy: readonly [
        { readonly updatedAt: 'desc' },
        { readonly id: 'desc' },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaSourceCredentialRecord[]>;
  };
  readonly sourceCredentialSecret: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaSourceCredentialSecretWriteData;
      readonly create: { readonly id: string } & PrismaSourceCredentialSecretWriteData;
    }): Promise<PrismaSourceCredentialSecretRecord>;
    findUnique(args: {
      readonly where: { readonly id: string };
    }): Promise<PrismaSourceCredentialSecretRecord | null>;
    delete(args: {
      readonly where: { readonly id: string };
    }): Promise<PrismaSourceCredentialSecretRecord>;
  };
  readonly scanPolicy: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly intervalSeconds: number;
        readonly freshnessSeconds: number;
        readonly retryBudget: number;
        readonly nextRunAt: Date;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
        readonly intervalSeconds: number;
        readonly freshnessSeconds: number;
        readonly retryBudget: number;
        readonly nextRunAt: Date;
      };
    }): Promise<PrismaScanPolicyRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId?: string;
        readonly sourceBindingId?: string;
      };
    }): Promise<PrismaScanPolicyRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId?: string;
        readonly workspaceId?: string;
        readonly nextRunAt: { readonly lte: Date };
      };
      readonly orderBy: { readonly nextRunAt: 'asc' };
      readonly take: number;
    }): Promise<readonly PrismaScanPolicyRecord[]>;
  };
  readonly scanJob: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly status: 'REQUESTED' | 'ENQUEUED' | 'SUCCEEDED' | 'FAILED';
        readonly idempotencyKey: string;
        readonly requestedAt: Date;
        readonly enqueuedAt?: Date | null;
        readonly completedAt?: Date | null;
        readonly failureReason?: string | null;
        readonly failureMetadata?: Readonly<Record<string, unknown>> | null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
        readonly scanPolicyId: string;
        readonly status: 'REQUESTED' | 'ENQUEUED' | 'SUCCEEDED' | 'FAILED';
        readonly idempotencyKey: string;
        readonly requestedAt: Date;
        readonly enqueuedAt?: Date | null;
        readonly completedAt?: Date | null;
        readonly failureReason?: string | null;
        readonly failureMetadata?: Readonly<Record<string, unknown>> | null;
      };
    }): Promise<PrismaScanJobRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly idempotencyKey?: string;
        readonly sourceBindingId?: string;
        readonly status?: { readonly in: readonly ('REQUESTED' | 'ENQUEUED')[] };
      };
      readonly orderBy?: { readonly requestedAt: 'asc' | 'desc' };
    }): Promise<PrismaScanJobRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
        readonly requestedAt?: {
          readonly gte: Date;
          readonly lt: Date;
        };
      };
      readonly orderBy: readonly [
        { readonly requestedAt: 'desc' },
        { readonly id: 'desc' },
      ];
      readonly take: number;
      readonly cursor?: { readonly id: string };
      readonly skip?: number;
    }): Promise<readonly PrismaScanJobRecord[]>;
  };
  readonly scanSchedulerDecision: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_decisionKey: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly decisionKey: string;
        };
      };
      readonly update: PrismaScanSchedulerDecisionWriteData;
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly decisionKey: string;
        readonly scanPolicyId: string;
        readonly sourceBindingId: string;
      } & PrismaScanSchedulerDecisionWriteData;
    }): Promise<PrismaScanSchedulerDecisionRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
        readonly evaluatedAt: {
          readonly gte: Date;
          readonly lt: Date;
        };
      };
      readonly orderBy: readonly [
        { readonly evaluatedAt: 'desc' },
        { readonly id: 'desc' },
      ];
      readonly take: number;
    }): Promise<readonly PrismaScanSchedulerDecisionRecord[]>;
  };
  readonly scanAttempt: {
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scanJobId: string;
      };
    }): Promise<PrismaScanAttemptRecord | null>;
  };
  readonly outboxEvent: {
    create(args: {
      readonly data: {
        readonly id: string;
        readonly tenantId?: string | null;
        readonly workspaceId?: string | null;
        readonly eventType: string;
        readonly schemaVersion: number;
        readonly payload: Readonly<Record<string, unknown>>;
        readonly correlationId: string;
        readonly causationId?: string | null;
      };
    }): Promise<PrismaOutboxEventRecord>;
  };
  readonly idempotencyKey: {
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scope: string;
        readonly key: string;
      };
    }): Promise<PrismaIdempotencyKeyRecord | null>;
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_scope_key: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly scope: string;
          readonly key: string;
        };
      };
      readonly update: {
        readonly responsePayload: unknown;
        readonly responseStatus: number | null;
        readonly expiresAt: Date | null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scope: string;
        readonly key: string;
        readonly requestHash: string | null;
        readonly responsePayload: unknown;
        readonly responseStatus: number | null;
        readonly expiresAt: Date | null;
      };
    }): Promise<PrismaIdempotencyKeyRecord>;
  };
};
