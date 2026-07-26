export type PrismaEventOutboxStatus = 'PENDING' | 'PUBLISHED' | 'FAILED';

export type PrismaEventOutboxRecord = {
  readonly id: string;
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly messageKind: 'EVENT' | 'COMMAND';
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly payload: unknown;
  readonly status: PrismaEventOutboxStatus;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
};

export type PrismaInboxRecord = {
  readonly id: string;
  readonly consumerName: string;
  readonly eventId: string;
  readonly tenantId: string | null;
  readonly processedAt: Date;
  readonly schemaVersion: number;
};

export type PrismaEventStoreClient = {
  readonly outboxEvent: {
    findMany(args: {
      readonly where: {
        readonly messageKind: 'EVENT';
        readonly status: 'PENDING';
      };
      readonly orderBy: readonly [{ readonly createdAt: 'asc' }, { readonly id: 'asc' }];
      readonly take: number;
    }): Promise<readonly PrismaEventOutboxRecord[]>;
    update(args: {
      readonly where: { readonly id: string };
      readonly data: {
        readonly status: PrismaEventOutboxStatus;
        readonly publishedAt?: Date | null;
      };
    }): Promise<PrismaEventOutboxRecord>;
  };
  readonly inboxRecord: {
    findUnique(args: {
      readonly where: {
        readonly consumerName_eventId: {
          readonly consumerName: string;
          readonly eventId: string;
        };
      };
    }): Promise<PrismaInboxRecord | null>;
    create(args: {
      readonly data: {
        readonly id: string;
        readonly consumerName: string;
        readonly eventId: string;
        readonly tenantId: string | null;
        readonly schemaVersion: number;
      };
    }): Promise<PrismaInboxRecord>;
  };
};
