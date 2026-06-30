export type PrismaConversationUnitRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly rootFeedItemId: string;
  readonly rootProviderItemId: string;
  readonly providerKey: string;
  readonly providerUnitId: string;
  readonly canonicalUrl: string;
  readonly authorHandle: string | null;
  readonly body: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly threadExternalId: string;
  readonly parentProviderUnitId: string | null;
  readonly depth: number;
  readonly role: string;
  readonly providerMetadata: unknown | null;
  readonly contentHash: string;
  readonly schemaVersion: number;
};

export type PrismaConversationSignalBaselineSampleRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly conversationUnitId: string;
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly strength: number;
  readonly publishedAt: Date;
  readonly observedAt: Date;
};

export type PrismaConversationClient = {
  readonly conversationUnit: {
    upsert(args: {
      readonly where: {
        readonly tenantId_providerKey_providerUnitId: {
          readonly tenantId: string;
          readonly providerKey: string;
          readonly providerUnitId: string;
        };
      };
      readonly update: PrismaConversationUnitWriteRecord;
      readonly create: PrismaConversationUnitWriteRecord & {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
      };
    }): Promise<PrismaConversationUnitRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly rootFeedItemId?: { readonly in: readonly string[] };
      };
      readonly orderBy: readonly [
        { readonly rootFeedItemId: 'asc' },
        { readonly depth: 'asc' },
        { readonly publishedAt: 'desc' },
      ];
    }): Promise<readonly PrismaConversationUnitRecord[]>;
  };
  readonly conversationSignalBaselineSample: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_conversationUnitId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly conversationUnitId: string;
        };
      };
      readonly update: PrismaConversationSignalBaselineSampleWriteRecord;
      readonly create: PrismaConversationSignalBaselineSampleWriteRecord & {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly conversationUnitId: string;
      };
    }): Promise<PrismaConversationSignalBaselineSampleRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly interestId?: string;
        readonly observedAt: { readonly gt: Date };
        readonly OR?: readonly {
          readonly providerKey: string;
          readonly sourceKey: string;
          readonly contentType: string;
        }[];
      };
      readonly orderBy: readonly [
        { readonly observedAt: 'desc' },
        { readonly conversationUnitId: 'desc' },
      ];
      readonly take: number;
    }): Promise<readonly PrismaConversationSignalBaselineSampleRecord[]>;
  };
};

export type PrismaConversationUnitWriteRecord = {
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly rootFeedItemId: string;
  readonly rootProviderItemId: string;
  readonly providerKey: string;
  readonly providerUnitId: string;
  readonly canonicalUrl: string;
  readonly authorHandle?: string | null;
  readonly body: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly threadExternalId: string;
  readonly parentProviderUnitId?: string | null;
  readonly depth: number;
  readonly role: string;
  readonly providerMetadata?: Readonly<Record<string, unknown>> | null;
  readonly contentHash: string;
  readonly schemaVersion: number;
};

export type PrismaConversationSignalBaselineSampleWriteRecord = {
  readonly interestId: string;
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly strength: number;
  readonly publishedAt: Date;
  readonly observedAt: Date;
};
