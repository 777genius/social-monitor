import type {
  PrismaApiKeyCredentialRecord,
  PrismaApiKeyCredentialStatus,
  PrismaMembershipRecord,
} from './prisma-identity-records';

export type PrismaIdentityClient = {
  readonly apiKeyCredential: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly name: string;
        readonly keyPrefix: string;
        readonly secretHash: string;
        readonly scopes: readonly string[];
        readonly status: PrismaApiKeyCredentialStatus;
        readonly revokedAt?: Date | null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly name: string;
        readonly keyPrefix: string;
        readonly secretHash: string;
        readonly scopes: readonly string[];
        readonly status: PrismaApiKeyCredentialStatus;
        readonly createdAt: Date;
        readonly revokedAt?: Date | null;
      };
    }): Promise<PrismaApiKeyCredentialRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId?: string;
        readonly workspaceId?: string;
        readonly id?: string;
        readonly keyPrefix?: string;
      };
    }): Promise<PrismaApiKeyCredentialRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
      };
      readonly orderBy: readonly [
        { readonly createdAt: 'desc' },
        { readonly id: 'desc' },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaApiKeyCredentialRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
      };
    }): Promise<number>;
  };
  readonly membership: {
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly userId: string;
        readonly user?: { readonly deletedAt: null };
        readonly workspace?: { readonly deletedAt: null };
      };
    }): Promise<PrismaMembershipRecord | null>;
  };
};
