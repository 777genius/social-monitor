import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { IdGenerator } from '@social-monitor/shared-kernel';

import {
  contentHashForConversationUnit,
  conversationSignalBaselineSampleFromUnit,
  type ConversationSignalBaselineSample,
  type ConversationUnit,
} from '../../../domain';
import type {
  ConversationSignalBaselineRepositoryPort,
  ListConversationSignalBaselineSamplesQuery,
} from '../../../ports/conversation-signal-baseline-repository.port';
import type {
  ConversationUnitRepositoryPort,
  ListConversationUnitsByRootQuery,
  SaveConversationUnitsCommand,
  SaveConversationUnitsResult,
} from '../../../ports/conversation-unit-repository.port';
import type { PrismaConversationClient } from './prisma-conversation-client';
import {
  conversationSignalBaselineSampleFromPrisma,
  conversationUnitFromPrisma,
} from './prisma-conversation-records';

export class PrismaConversationUnitRepository
  implements ConversationUnitRepositoryPort, ConversationSignalBaselineRepositoryPort
{
  constructor(
    private readonly prisma: PrismaConversationClient,
    private readonly ids: IdGenerator,
  ) {}

  async saveBatch(
    command: SaveConversationUnitsCommand,
  ): Promise<SaveConversationUnitsResult> {
    let saved = 0;

    for (const unit of command.units) {
      const snapshot = unit.toSnapshot();

      if (
        snapshot.tenantId !== command.tenantId ||
        snapshot.workspaceId !== command.workspaceId
      ) {
        continue;
      }

      await withPrismaWriteRetry(async () => {
        const record = await this.prisma.conversationUnit.upsert({
          where: {
            tenantId_providerKey_providerUnitId: {
              tenantId: command.tenantId,
              providerKey: snapshot.providerKey,
              providerUnitId: snapshot.providerUnitId,
            },
          },
          update: {
            interestId: snapshot.interestId,
            sourceBindingId: snapshot.sourceBindingId,
            rootFeedItemId: snapshot.rootFeedItemId,
            rootProviderItemId: snapshot.rootProviderItemId,
            providerKey: snapshot.providerKey,
            providerUnitId: snapshot.providerUnitId,
            canonicalUrl: snapshot.canonicalUrl,
            authorHandle: snapshot.authorHandle ?? null,
            body: snapshot.body,
            publishedAt: snapshot.publishedAt,
            observedAt: snapshot.observedAt,
            threadExternalId: snapshot.threadExternalId,
            parentProviderUnitId: snapshot.parentProviderUnitId ?? null,
            depth: snapshot.depth,
            role: snapshot.role,
            providerMetadata: snapshot.providerMetadata ?? null,
            contentHash: contentHashForConversationUnit(snapshot),
            schemaVersion: snapshot.schemaVersion,
          },
          create: {
            id: snapshot.id,
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            interestId: snapshot.interestId,
            sourceBindingId: snapshot.sourceBindingId,
            rootFeedItemId: snapshot.rootFeedItemId,
            rootProviderItemId: snapshot.rootProviderItemId,
            providerKey: snapshot.providerKey,
            providerUnitId: snapshot.providerUnitId,
            canonicalUrl: snapshot.canonicalUrl,
            authorHandle: snapshot.authorHandle ?? null,
            body: snapshot.body,
            publishedAt: snapshot.publishedAt,
            observedAt: snapshot.observedAt,
            threadExternalId: snapshot.threadExternalId,
            parentProviderUnitId: snapshot.parentProviderUnitId ?? null,
            depth: snapshot.depth,
            role: snapshot.role,
            providerMetadata: snapshot.providerMetadata ?? null,
            contentHash: contentHashForConversationUnit(snapshot),
            schemaVersion: snapshot.schemaVersion,
          },
        });
        const savedUnit = conversationUnitFromPrisma(record);
        const sample = conversationSignalBaselineSampleFromUnit(savedUnit);

        if (sample !== undefined) {
          await this.prisma.conversationSignalBaselineSample.upsert({
            where: {
              tenantId_workspaceId_conversationUnitId: {
                tenantId: command.tenantId,
                workspaceId: command.workspaceId,
                conversationUnitId: record.id,
              },
            },
            update: baselineSampleWrite(sample),
            create: {
              id: this.ids.generate(),
              tenantId: command.tenantId,
              workspaceId: command.workspaceId,
              conversationUnitId: record.id,
              ...baselineSampleWrite(sample),
            },
          });
        }
      });

      saved += 1;
    }

    return { saved };
  }

  async listByRootFeedItemIds(
    query: ListConversationUnitsByRootQuery,
  ): Promise<readonly ConversationUnit[]> {
    if (query.rootFeedItemIds.length === 0) {
      return [];
    }

    const records = await this.prisma.conversationUnit.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        rootFeedItemId: { in: query.rootFeedItemIds },
        observedAt: dateRange({
          lte: query.observedAtOrBefore,
          lt: query.observedBefore,
        }),
      },
      orderBy: [
        { rootFeedItemId: 'asc' },
        { depth: 'asc' },
        { publishedAt: 'desc' },
      ],
    });
    const grouped = new Map<string, ConversationUnit[]>();

    for (const record of records) {
      const unit = conversationUnitFromPrisma(record);
      const snapshot = unit.toSnapshot();
      const existing = grouped.get(snapshot.rootFeedItemId) ?? [];
      existing.push(unit);
      grouped.set(snapshot.rootFeedItemId, existing);
    }

    return [...grouped.values()].flatMap((units) =>
      units.slice(0, query.limitPerRoot),
    );
  }

  async listSamples(
    query: ListConversationSignalBaselineSamplesQuery,
  ): Promise<readonly ConversationSignalBaselineSample[]> {
    const records = await this.prisma.conversationSignalBaselineSample.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        ...(query.interestId === undefined ? {} : { interestId: query.interestId }),
        observedAt: {
          gt: query.observedAfter,
          ...(query.observedAtOrBefore === undefined
            ? {}
            : { lte: query.observedAtOrBefore }),
          ...(query.observedBefore === undefined
            ? {}
            : { lt: query.observedBefore }),
        },
        ...(query.cohortFilters === undefined || query.cohortFilters.length === 0
          ? {}
          : {
              OR: query.cohortFilters.map((filter) => ({
                providerKey: filter.providerKey,
                sourceKey: filter.sourceKey,
                contentType: filter.contentType,
              })),
            }),
      },
      orderBy: [{ observedAt: 'desc' }, { conversationUnitId: 'desc' }],
      take: query.limit,
    });

    return records.map(conversationSignalBaselineSampleFromPrisma);
  }
}

const dateRange = (range: {
  readonly lte?: Date;
  readonly lt?: Date;
}) => range.lte === undefined && range.lt === undefined ? undefined : range;

const baselineSampleWrite = (sample: ConversationSignalBaselineSample) => ({
  interestId: sample.interestId,
  providerKey: sample.providerKey,
  sourceKey: sample.sourceKey,
  contentType: sample.contentType,
  strength: sample.strength,
  publishedAt: sample.publishedAt,
  observedAt: sample.observedAt,
});
