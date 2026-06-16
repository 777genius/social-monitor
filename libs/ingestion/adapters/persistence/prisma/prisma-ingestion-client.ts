import type {
  PrismaCursorCheckpointRecord,
  PrismaScanAttemptRecord,
  PrismaScanFailureQueueEntryRecord,
  PrismaScanLeaseEntryRecord,
  PrismaSourceItemRecord,
} from './prisma-ingestion-records';

export type PrismaIngestionClient = {
  readonly sourceItem: {
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly providerKey: string;
        readonly providerItemId: string;
      };
    }): Promise<PrismaSourceItemRecord | null>;
    create(args: {
      readonly data: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
        readonly providerKey: string;
        readonly providerItemId: string;
        readonly canonicalUrl: string;
        readonly title: string;
        readonly body: string;
        readonly authorHandle?: string | null;
        readonly publishedAt: Date;
        readonly contentHash: string;
        readonly observedAt: Date;
        readonly metadata: Readonly<Record<string, unknown>>;
      };
    }): Promise<PrismaSourceItemRecord>;
  };
  readonly cursorCheckpoint: {
    upsert(args: {
      readonly where: { readonly tenantId_sourceBindingId: { readonly tenantId: string; readonly sourceBindingId: string } };
      readonly update: {
        readonly cursorPayload: Readonly<Record<string, unknown>>;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
        readonly cursorPayload: Readonly<Record<string, unknown>>;
      };
    }): Promise<PrismaCursorCheckpointRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
      };
    }): Promise<PrismaCursorCheckpointRecord | null>;
  };
  readonly scanFailureQueueEntry: {
    create(args: {
      readonly data: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scanJobId: string;
        readonly topicId: string;
        readonly sourceBindingId: string;
        readonly scanPolicyId: string;
        readonly providerKey: string;
        readonly sourceQuery: Readonly<Record<string, unknown>>;
        readonly correlationId: string;
        readonly causationId: string;
        readonly attemptNumber: number;
        readonly retryBudget: number;
        readonly nextAttemptNumber?: number | null;
        readonly failureReason: string;
        readonly status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED';
      };
    }): Promise<PrismaScanFailureQueueEntryRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId?: string;
        readonly workspaceId?: string;
        readonly status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED';
      };
      readonly orderBy: { readonly createdAt: 'asc' | 'desc' };
      readonly take: number;
    }): Promise<readonly PrismaScanFailureQueueEntryRecord[]>;
    deleteMany(args: {
      readonly where: {
        readonly id: { readonly in: readonly string[] };
      };
    }): Promise<{ readonly count: number }>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED';
      };
    }): Promise<number>;
  };
  readonly scanAttempt: {
    upsert(args: {
      readonly where: { readonly scanJobId: string };
      readonly update: {
        readonly status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
        readonly startedAt: Date;
        readonly finishedAt?: Date | null;
        readonly fetched: number;
        readonly inserted: number;
        readonly skippedDuplicates: number;
        readonly projected: number;
        readonly failureReason?: string | null;
      };
      readonly create: {
        readonly scanJobId: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly sourceBindingId: string;
        readonly status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
        readonly startedAt: Date;
        readonly finishedAt?: Date | null;
        readonly fetched: number;
        readonly inserted: number;
        readonly skippedDuplicates: number;
        readonly projected: number;
        readonly failureReason?: string | null;
      };
    }): Promise<PrismaScanAttemptRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scanJobId: string;
      };
    }): Promise<PrismaScanAttemptRecord | null>;
  };
  readonly scanLeaseEntry: {
    deleteMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scanJobId: string;
        readonly expiresAt?: { readonly lte: Date };
        readonly fencingToken?: string;
        readonly OR?: readonly (
          | { readonly expiresAt: { readonly lte: Date } }
          | { readonly fencingToken: string }
        )[];
      };
    }): Promise<{ readonly count: number }>;
    create(args: {
      readonly data: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scanJobId: string;
        readonly workerId: string;
        readonly fencingToken: string;
        readonly leasedAt: Date;
        readonly expiresAt: Date;
      };
    }): Promise<PrismaScanLeaseEntryRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scanJobId: string;
      };
    }): Promise<PrismaScanLeaseEntryRecord | null>;
  };
};
