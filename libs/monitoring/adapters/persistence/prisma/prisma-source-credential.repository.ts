import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceCredential } from '../../../domain';
import type {
  ListSourceCredentialsQuery,
  ListSourceCredentialsResult,
  SourceCredentialRepositoryPort,
} from '../../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from '../offset-pagination';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import {
  sourceCredentialFromPrisma,
  sourceCredentialKindToPrisma,
  sourceCredentialStatusToPrisma,
} from './prisma-monitoring-records';

export class PrismaSourceCredentialRepository implements SourceCredentialRepositoryPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async save(credential: SourceCredential): Promise<void> {
    const snapshot = credential.toSnapshot();

    await withPrismaWriteRetry(() => this.prisma.sourceCredential.upsert({
      where: { id: snapshot.id },
      update: {
        kind: sourceCredentialKindToPrisma(snapshot.kind),
        status: sourceCredentialStatusToPrisma(snapshot.status),
        secretKeyId: snapshot.secretKeyId,
        secretPreview: snapshot.secretPreview,
        scopes: snapshot.scopes,
        expiresAt: snapshot.expiresAt ?? null,
        rotatedAt: snapshot.rotatedAt ?? null,
        revokedAt: snapshot.revokedAt ?? null,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        providerKey: snapshot.providerKey,
        kind: sourceCredentialKindToPrisma(snapshot.kind),
        status: sourceCredentialStatusToPrisma(snapshot.status),
        secretKeyId: snapshot.secretKeyId,
        secretPreview: snapshot.secretPreview,
        scopes: snapshot.scopes,
        expiresAt: snapshot.expiresAt ?? null,
        rotatedAt: snapshot.rotatedAt ?? null,
        revokedAt: snapshot.revokedAt ?? null,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    }));
  }

  async findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceCredentialId: string;
  }): Promise<SourceCredential | null> {
    const record = await this.prisma.sourceCredential.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.sourceCredentialId,
      },
    });

    return record === null ? null : sourceCredentialFromPrisma(record);
  }

  async list(query: ListSourceCredentialsQuery): Promise<ListSourceCredentialsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const limit = Math.max(1, Math.min(query.limit, 100));
    const records = await this.prisma.sourceCredential.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        ...(query.providerKey === undefined ? {} : { providerKey: query.providerKey }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit + 1,
    });
    const sourceCredentials = records.slice(0, limit).map(sourceCredentialFromPrisma);
    const nextOffset = offset + sourceCredentials.length;

    return {
      sourceCredentials,
      nextCursor: records.length > limit ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }
}
