import type { PrismaFeedItemRecord } from './prisma-feed-records';

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
        readonly canonicalUrl: string;
        readonly title: string;
        readonly bodyPreview: string;
        readonly authorHandle?: string | null;
        readonly publishedAt: Date;
        readonly observedAt: Date;
        readonly status: 'VISIBLE';
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId: string;
        readonly sourceItemId: string;
        readonly sourceBindingId: string;
        readonly dedupeKey: string;
        readonly canonicalUrl: string;
        readonly title: string;
        readonly bodyPreview: string;
        readonly authorHandle?: string | null;
        readonly publishedAt: Date;
        readonly observedAt: Date;
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
};
