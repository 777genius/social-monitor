export type PrismaCommandOutboxRecord = {
  readonly id: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly payload: unknown;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly publishAttempts: number;
};

export type PrismaCommandOutboxTransactionClient = {
  readonly outboxEvent: {
    findMany(args: {
      readonly where: {
        readonly messageKind: 'COMMAND';
        readonly status: 'PENDING';
        readonly availableAt: { readonly lte: Date };
        readonly OR: readonly [
          { readonly leasedUntil: null },
          { readonly leasedUntil: { readonly lte: Date } },
        ];
      };
      readonly orderBy: readonly [
        { readonly availableAt: 'asc' },
        { readonly createdAt: 'asc' },
        { readonly id: 'asc' },
      ];
      readonly take: number;
    }): Promise<readonly PrismaCommandOutboxRecord[]>;
    updateMany(args: {
      readonly where: {
        readonly id: { readonly in: readonly string[] } | string;
        readonly messageKind?: 'COMMAND';
        readonly status: 'PENDING';
        readonly leaseOwner?: string;
        readonly availableAt?: { readonly lte: Date };
        readonly OR?: readonly [
          { readonly leasedUntil: null },
          { readonly leasedUntil: { readonly lte: Date } },
        ];
      };
      readonly data: {
        readonly status?: 'PENDING' | 'PUBLISHED' | 'FAILED';
        readonly publishAttempts?: { readonly increment: number };
        readonly leaseOwner?: string | null;
        readonly leasedUntil?: Date | null;
        readonly availableAt?: Date;
        readonly lastError?: string | null;
        readonly publishedAt?: Date | null;
      };
    }): Promise<{ readonly count: number }>;
  };
};

export type PrismaCommandOutboxClient = {
  $transaction<TValue>(
    work: (
      transaction: PrismaCommandOutboxTransactionClient,
    ) => Promise<TValue>,
    options: { readonly isolationLevel: 'Serializable' },
  ): Promise<TValue>;
  readonly outboxEvent: PrismaCommandOutboxTransactionClient['outboxEvent'];
};
