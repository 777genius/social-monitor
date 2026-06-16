import type {
  PrismaPublicApiAuditEventRecord,
  PrismaRateLimitBucketRecord,
  PrismaUsageQuotaBucketRecord,
} from './prisma-usage-records';

export type PrismaUsageClient = {
  readonly publicApiAuditEvent: {
    create(args: {
      readonly data: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly actorType: 'api_key' | 'system';
        readonly actorId: string;
        readonly action: string;
        readonly outcome: 'succeeded' | 'failed' | 'denied';
        readonly reasonCode?: string | null;
        readonly resourceType: string;
        readonly resourceId?: string | null;
        readonly metadata: Readonly<Record<string, unknown>>;
        readonly occurredAt: Date;
      };
    }): Promise<PrismaPublicApiAuditEventRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly actorType?: 'api_key' | 'system';
        readonly actorId?: string;
        readonly action?: string;
        readonly outcome?: 'succeeded' | 'failed' | 'denied';
        readonly resourceType?: string;
      };
      readonly orderBy: readonly [{ readonly occurredAt: 'desc' }, { readonly id: 'desc' }];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaPublicApiAuditEventRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly actorType?: 'api_key' | 'system';
        readonly actorId?: string;
        readonly action?: string;
        readonly outcome?: 'succeeded' | 'failed' | 'denied';
        readonly resourceType?: string;
      };
    }): Promise<number>;
  };
  readonly rateLimitBucket: {
    deleteMany(args: {
      readonly where: { readonly windowEndsAt: { readonly lte: Date } };
    }): Promise<{ readonly count: number }>;
    upsert(args: {
      readonly where: { readonly bucketKey: string };
      readonly update: {
        readonly windowStartedAt: Date;
        readonly windowEndsAt: Date;
        readonly count: { readonly increment: number };
      };
      readonly create: {
        readonly bucketKey: string;
        readonly windowStartedAt: Date;
        readonly windowEndsAt: Date;
        readonly count: number;
      };
    }): Promise<PrismaRateLimitBucketRecord>;
  };
  readonly usageQuotaBucket: {
    deleteMany(args: {
      readonly where: { readonly windowEndsAt: { readonly lte: Date } };
    }): Promise<{ readonly count: number }>;
    findUnique(args: {
      readonly where: { readonly bucketKey: string };
    }): Promise<PrismaUsageQuotaBucketRecord | null>;
    upsert(args: {
      readonly where: { readonly bucketKey: string };
      readonly update: {
        readonly windowEndsAt: Date;
        readonly consumed: number;
        readonly limit: number;
      };
      readonly create: {
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
    }): Promise<PrismaUsageQuotaBucketRecord>;
  };
};
