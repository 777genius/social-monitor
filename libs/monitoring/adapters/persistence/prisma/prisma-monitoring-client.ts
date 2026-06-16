import type {
  PrismaScanJobRecord,
  PrismaScanAttemptRecord,
  PrismaScanPolicyRecord,
  PrismaSourceBindingRecord,
  PrismaSourceCatalogEntryRecord,
  PrismaTopicRecord,
} from './prisma-monitoring-records';

export type PrismaMonitoringClient = {
  readonly topic: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly name: string;
        readonly query: string;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly name: string;
        readonly query: string;
      };
    }): Promise<PrismaTopicRecord>;
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
};
