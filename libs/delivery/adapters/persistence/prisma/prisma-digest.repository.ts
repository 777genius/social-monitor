import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { Digest } from '../../../domain';
import type { DigestRepositoryPort } from '../../../ports';
import type { PrismaDeliveryClient, PrismaDigestWriteData } from './prisma-delivery-client';
import { digestFromPrisma, digestStatusToPrisma } from './prisma-delivery-records';

export class PrismaDigestRepository implements DigestRepositoryPort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async save(digest: Digest): Promise<void> {
    const snapshot = digest.toSnapshot();
    const data: PrismaDigestWriteData = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      recipientKey: snapshot.recipientKey,
      channel: snapshot.channel,
      windowId: snapshot.window.windowId,
      windowStartedAt: snapshot.window.startedAt,
      windowEndedAt: snapshot.window.endedAt,
      status: digestStatusToPrisma(snapshot.status),
      summaryIds: snapshot.summaryIds,
      feedItemIds: snapshot.feedItemIds,
      provenance: snapshot.provenance,
      contentHash: snapshot.contentHash,
      assembledAt: snapshot.assembledAt,
    };

    await withPrismaWriteRetry(() => this.prisma.digest.upsert({
      where: { id: snapshot.id },
      update: data,
      create: {
        id: snapshot.id,
        ...data,
      },
    }));
  }

  async findById(params: Parameters<DigestRepositoryPort['findById']>[0]): Promise<Digest | null> {
    const record = await this.prisma.digest.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.digestId,
      },
    });

    return record === null ? null : digestFromPrisma(record);
  }

  async findByWindow(params: Parameters<DigestRepositoryPort['findByWindow']>[0]): Promise<Digest | null> {
    const record = await this.prisma.digest.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        recipientKey: params.recipientKey,
        channel: params.channel,
        windowId: params.windowId,
      },
    });

    return record === null ? null : digestFromPrisma(record);
  }
}
