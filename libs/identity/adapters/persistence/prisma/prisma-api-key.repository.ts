import type { ApiKey } from '../../../domain';
import type { ApiKeyRepositoryPort, ListApiKeysQuery, ListApiKeysResult } from '../../../ports';
import type { PrismaIdentityClient } from './prisma-identity-client';
import { apiKeyFromPrisma, apiKeyStatusToPrisma } from './prisma-identity-records';

export class PrismaApiKeyRepository implements ApiKeyRepositoryPort {
  constructor(private readonly prisma: PrismaIdentityClient) {}

  async save(apiKey: ApiKey): Promise<void> {
    const snapshot = apiKey.toSnapshot();
    const status = apiKeyStatusToPrisma(snapshot.status);

    await this.prisma.apiKeyCredential.upsert({
      where: { id: snapshot.id },
      update: {
        name: snapshot.name,
        keyPrefix: snapshot.keyPrefix,
        secretHash: snapshot.secretHash,
        scopes: snapshot.scopes,
        status,
        revokedAt: snapshot.revokedAt ?? null,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        name: snapshot.name,
        keyPrefix: snapshot.keyPrefix,
        secretHash: snapshot.secretHash,
        scopes: snapshot.scopes,
        status,
        createdAt: snapshot.createdAt,
        revokedAt: snapshot.revokedAt ?? null,
      },
    });
  }

  async findById(params: Parameters<ApiKeyRepositoryPort['findById']>[0]): Promise<ApiKey | null> {
    const record = await this.prisma.apiKeyCredential.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.apiKeyId,
      },
    });

    return record === null ? null : apiKeyFromPrisma(record);
  }

  async findByKeyPrefix(params: { readonly keyPrefix: string }): Promise<ApiKey | null> {
    const record = await this.prisma.apiKeyCredential.findFirst({
      where: { keyPrefix: params.keyPrefix },
    });

    return record === null ? null : apiKeyFromPrisma(record);
  }

  async list(query: ListApiKeysQuery): Promise<ListApiKeysResult> {
    const offset = parseCursor(query.cursor);
    const take = Math.max(1, Math.min(query.limit, 100));
    const [apiKeys, total] = await Promise.all([
      this.prisma.apiKeyCredential.findMany({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take,
      }),
      this.prisma.apiKeyCredential.count({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
        },
      }),
    ]);
    const nextOffset = offset + apiKeys.length;

    return {
      apiKeys: apiKeys.map(apiKeyFromPrisma),
      nextCursor: nextOffset < total ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
