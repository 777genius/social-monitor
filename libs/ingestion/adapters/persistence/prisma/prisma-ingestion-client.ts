import type {
  PrismaCursorCheckpointRecord,
  PrismaScanAttemptRecord,
  PrismaScanFailureQueueEntryRecord,
  PrismaScanLeaseEntryRecord,
  PrismaSourceCandidateMemoryRecord,
  PrismaSourceItemRecord,
} from "./prisma-ingestion-records";

type GitHubRepositoryTrendCandidateKey = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scanJobId: string;
  readonly repositoryFullName: string;
  readonly primaryWindow: string;
};

type GitHubRepositoryTrendSnapshotKey = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly repositoryFullName: string;
  readonly checkedAt: Date;
};

type GitHubRepositoryTrendData = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId?: string;
  readonly sourceBindingId?: string;
  readonly scanJobId?: string;
  readonly sourceItemId?: string;
  readonly repositoryFullName: string;
  readonly repositoryUrl?: string;
  readonly description?: string | null;
  readonly language?: string | null;
  readonly topics?: readonly string[];
  readonly license?: string | null;
  readonly totalStars?: number;
  readonly primaryWindow?: string;
  readonly stars24h?: number;
  readonly stars48h?: number;
  readonly stars7d?: number;
  readonly stars30d?: number;
  readonly stars90d?: number;
  readonly rank?: number;
  readonly checkedAt?: Date;
  readonly observedAt?: Date;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type PrismaSourceCandidateMemoryClient = {
  readonly sourceCandidateMemory: {
    deleteMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id: { readonly in: readonly string[] };
      };
    }): Promise<{ readonly count: number }>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly interestId?: string;
        readonly sourceBindingId?: string;
        readonly providerKey?: string;
        readonly scopeFingerprint?: string;
        readonly policyVersion?: string;
        readonly providerItemId?: { readonly in: readonly string[] };
        readonly expiresAt?: {
          readonly gt?: Date;
          readonly lte?: Date;
        };
      };
      readonly orderBy?: { readonly expiresAt: "asc" };
      readonly take?: number;
    }): Promise<readonly PrismaSourceCandidateMemoryRecord[]>;
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_interestId_sourceBindingId_providerKey_scopeFingerprint_providerItemId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly interestId: string;
          readonly sourceBindingId: string;
          readonly providerKey: string;
          readonly scopeFingerprint: string;
          readonly providerItemId: string;
        };
      };
      readonly update: {
        readonly fingerprint: string;
        readonly contentFingerprint: string;
        readonly engagementFingerprint: string | null;
        readonly policyVersion: string;
        readonly decision: string;
        readonly reasonCode: string;
        readonly expiresAt: Date;
        readonly lastSeenAt: Date;
        readonly seenCount: { readonly increment: number };
        readonly schemaVersion: number;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly interestId: string;
        readonly sourceBindingId: string;
        readonly providerKey: string;
        readonly providerItemId: string;
        readonly scopeFingerprint: string;
        readonly fingerprint: string;
        readonly contentFingerprint: string;
        readonly engagementFingerprint: string | null;
        readonly policyVersion: string;
        readonly decision: string;
        readonly reasonCode: string;
        readonly expiresAt: Date;
        readonly firstSeenAt: Date;
        readonly lastSeenAt: Date;
        readonly schemaVersion: number;
      };
    }): Promise<PrismaSourceCandidateMemoryRecord>;
  };
};

export type PrismaIngestionClient = {
  readonly sourceItem: {
    findMany?(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly providerKey: string;
        readonly providerItemId: { readonly in: readonly string[] };
      };
    }): Promise<readonly PrismaSourceItemRecord[]>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
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
        readonly providerContentHash: string;
        readonly observedAt: Date;
        readonly lastObservedAt: Date;
        readonly contentUpdatedAt: Date;
        readonly metadata: Readonly<Record<string, unknown>>;
      };
    }): Promise<PrismaSourceItemRecord>;
    update?(args: {
      readonly where: { readonly id: string };
      readonly data: {
        readonly sourceBindingId?: string;
        readonly canonicalUrl?: string;
        readonly title?: string;
        readonly body?: string;
        readonly authorHandle?: string | null;
        readonly publishedAt?: Date;
        readonly contentHash?: string;
        readonly providerContentHash?: string;
        readonly lastObservedAt: Date;
        readonly contentUpdatedAt?: Date;
        readonly metadata?: Readonly<Record<string, unknown>>;
      };
    }): Promise<PrismaSourceItemRecord>;
  };
  readonly cursorCheckpoint: {
    upsert(args: {
      readonly where: {
        readonly tenantId_sourceBindingId: {
          readonly tenantId: string;
          readonly sourceBindingId: string;
        };
      };
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
        readonly interestId: string;
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
        readonly status: "RETRY_ENQUEUED" | "DEAD_LETTERED";
      };
    }): Promise<PrismaScanFailureQueueEntryRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId?: string;
        readonly workspaceId?: string;
        readonly status: "RETRY_ENQUEUED" | "DEAD_LETTERED";
      };
      readonly orderBy: { readonly createdAt: "asc" | "desc" };
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
        readonly status: "RETRY_ENQUEUED" | "DEAD_LETTERED";
      };
    }): Promise<number>;
  };
  readonly scanAttempt: {
    upsert(args: {
      readonly where: { readonly scanJobId: string };
      readonly update: {
        readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
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
        readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
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
  readonly gitHubRepositoryTrendCandidate: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_scanJobId_repositoryFullName_primaryWindow: GitHubRepositoryTrendCandidateKey;
      };
      readonly update: GitHubRepositoryTrendData;
      readonly create: GitHubRepositoryTrendData & { readonly id: string };
    }): Promise<unknown>;
  };
  readonly gitHubRepositoryTrendSnapshot: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_repositoryFullName_checkedAt: GitHubRepositoryTrendSnapshotKey;
      };
      readonly update: GitHubRepositoryTrendData;
      readonly create: GitHubRepositoryTrendData & { readonly id: string };
    }): Promise<unknown>;
  };
  readonly gitHubRepositoryTrendResult: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_scanJobId_repositoryFullName_primaryWindow: GitHubRepositoryTrendCandidateKey;
      };
      readonly update: GitHubRepositoryTrendData;
      readonly create: GitHubRepositoryTrendData & { readonly id: string };
    }): Promise<unknown>;
  };
};
