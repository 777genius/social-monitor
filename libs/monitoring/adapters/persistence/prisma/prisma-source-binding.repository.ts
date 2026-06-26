import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { DomainError, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBinding } from '../../../domain';
import type {
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  SourceBindingRepositoryPort,
} from '../../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from '../offset-pagination';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import {
  sourceBindingFromPrisma,
  sourceBindingStatusToPrisma,
} from './prisma-monitoring-records';

export class PrismaSourceBindingRepository implements SourceBindingRepositoryPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    const sourceCatalogEntry = await this.prisma.sourceCatalogEntry.findUnique({
      where: { providerKey: snapshot.providerKey },
    });

    if (sourceCatalogEntry === null) {
      throw new DomainError('validation.failed', 'Source catalog entry is missing for source binding provider', {
        providerKey: snapshot.providerKey,
      });
    }

    await withPrismaWriteRetry(() => this.prisma.sourceBinding.upsert({
      where: { id: snapshot.id },
      update: {
        capabilityProfileVersion: snapshot.capabilityProfileVersion,
        status: sourceBindingStatusToPrisma(snapshot.status),
        config: snapshot.config,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        topicId: snapshot.topicId,
        sourceCatalogEntryId: sourceCatalogEntry.id,
        capabilityProfileVersion: snapshot.capabilityProfileVersion,
        status: sourceBindingStatusToPrisma(snapshot.status),
        config: snapshot.config,
      },
    }));
  }

  async findByTopicAndProvider(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
    providerKey: string;
  }): Promise<SourceBinding | null> {
    const sourceCatalogEntry = await this.prisma.sourceCatalogEntry.findUnique({
      where: { providerKey: params.providerKey },
    });
    if (sourceCatalogEntry === null) {
      return null;
    }

    const record = await this.prisma.sourceBinding.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        topicId: params.topicId,
        sourceCatalogEntryId: sourceCatalogEntry.id,
        deletedAt: null,
      },
    });

    return record === null ? null : sourceBindingFromPrisma(record, sourceCatalogEntry);
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<SourceBinding | null> {
    const record = await this.prisma.sourceBinding.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.sourceBindingId,
        deletedAt: null,
      },
    });
    if (record === null) {
      return null;
    }

    const sourceCatalogEntry = await this.prisma.sourceCatalogEntry.findUnique({
      where: { id: record.sourceCatalogEntryId },
    });
    if (sourceCatalogEntry === null) {
      throw new DomainError('validation.failed', 'Source catalog entry is missing for persisted source binding', {
        sourceBindingId: record.id,
        sourceCatalogEntryId: record.sourceCatalogEntryId,
      });
    }

    return sourceBindingFromPrisma(record, sourceCatalogEntry);
  }

  async listByTopic(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const limit = Math.max(1, Math.min(query.limit, 100));
    const sourceCatalogEntryIds = query.providerKeys === undefined
      ? undefined
      : (await Promise.all(query.providerKeys.map((providerKey) =>
          this.prisma.sourceCatalogEntry.findUnique({ where: { providerKey } }),
        )))
          .flatMap((entry) => entry === null ? [] : [entry.id]);
    const records = await this.prisma.sourceBinding.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        topicId: query.topicId,
        ...(sourceCatalogEntryIds === undefined
          ? {}
          : { sourceCatalogEntryId: { in: sourceCatalogEntryIds } }),
        ...(query.statuses === undefined
          ? {}
          : { status: { in: query.statuses.map(sourceBindingStatusToPrisma) } }),
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit + 1,
    });
    const sourceBindings = await Promise.all(
      records.slice(0, limit).map(async (record) => {
        const sourceCatalogEntry = await this.prisma.sourceCatalogEntry.findUnique({
          where: { id: record.sourceCatalogEntryId },
        });
        if (sourceCatalogEntry === null) {
          throw new DomainError('validation.failed', 'Source catalog entry is missing for persisted source binding', {
            sourceBindingId: record.id,
            sourceCatalogEntryId: record.sourceCatalogEntryId,
          });
        }

        return sourceBindingFromPrisma(record, sourceCatalogEntry);
      }),
    );
    const nextOffset = offset + sourceBindings.length;

    return {
      sourceBindings,
      nextCursor: records.length > limit ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }
}
