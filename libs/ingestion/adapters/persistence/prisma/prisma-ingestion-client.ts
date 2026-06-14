import type { PrismaCursorCheckpointRecord, PrismaSourceItemRecord } from './prisma-ingestion-records';

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
};
