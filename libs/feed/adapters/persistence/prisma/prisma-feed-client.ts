import type { PrismaFeedItemRecord } from './prisma-feed-records';

export type PrismaFeedSignalBaselineSampleRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly topicId: string;
  readonly feedItemId: string;
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly strength: number;
  readonly publishedAt: Date;
  readonly observedAt: Date;
};

export type PrismaFeedClient = {
  readonly feedItem: {
    upsert(args: {
      readonly where: {
        readonly tenantId_topicId_dedupeKey: {
          readonly tenantId: string;
          readonly topicId: string;
          readonly dedupeKey: string;
        };
      };
      readonly update: {
        readonly sourceItemId: string;
        readonly sourceBindingId: string;
        readonly providerKey: string;
        readonly canonicalUrl: string;
        readonly title: string;
        readonly bodyPreview: string;
        readonly authorHandle?: string | null;
        readonly publishedAt: Date;
        readonly observedAt: Date;
        readonly providerMetadata?: Readonly<Record<string, unknown>> | null;
        readonly status: 'VISIBLE';
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId: string;
        readonly sourceItemId: string;
        readonly sourceBindingId: string;
        readonly providerKey: string;
        readonly dedupeKey: string;
        readonly canonicalUrl: string;
        readonly title: string;
        readonly bodyPreview: string;
        readonly authorHandle?: string | null;
        readonly publishedAt: Date;
        readonly observedAt: Date;
        readonly providerMetadata?: Readonly<Record<string, unknown>> | null;
        readonly status: 'VISIBLE';
      };
    }): Promise<PrismaFeedItemRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly status: 'VISIBLE';
        readonly topicId?: string;
        readonly observedAt?: { readonly gt: Date };
        readonly providerKey?: string;
      };
      readonly orderBy: readonly [{ readonly publishedAt: 'desc' }, { readonly id: 'desc' }];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaFeedItemRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly status: 'VISIBLE';
        readonly topicId?: string;
        readonly observedAt?: { readonly gt: Date };
        readonly providerKey?: string;
      };
    }): Promise<number>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id: string;
        readonly status: 'VISIBLE';
      };
    }): Promise<PrismaFeedItemRecord | null>;
  };
  readonly feedSignalBaselineSample: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_feedItemId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly feedItemId: string;
        };
      };
      readonly update: {
        readonly topicId: string;
        readonly providerKey: string;
        readonly sourceKey: string;
        readonly contentType: string;
        readonly strength: number;
        readonly publishedAt: Date;
        readonly observedAt: Date;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId: string;
        readonly feedItemId: string;
        readonly providerKey: string;
        readonly sourceKey: string;
        readonly contentType: string;
        readonly strength: number;
        readonly publishedAt: Date;
        readonly observedAt: Date;
      };
    }): Promise<PrismaFeedSignalBaselineSampleRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId?: string;
        readonly observedAt: { readonly gt: Date };
      };
      readonly orderBy: readonly [{ readonly observedAt: 'desc' }, { readonly feedItemId: 'desc' }];
      readonly take: number;
    }): Promise<readonly PrismaFeedSignalBaselineSampleRecord[]>;
    deleteMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly feedItemId: string;
      };
    }): Promise<{ readonly count: number }>;
  };
};
