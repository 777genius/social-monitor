import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import { briefingScopeKey, type BriefingArtifact } from '../../../domain';
import type {
  BriefingArtifactRepositoryPort,
  ListBriefingArtifactsQuery,
  ListBriefingArtifactsResult,
} from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import {
  briefingArtifactFromPrisma,
  briefingArtifactStatusToPrisma,
  briefingQualitySignalsToPrisma,
  briefingScopeToPrisma,
  serializeBriefingArtifact,
} from './prisma-briefing-records';
import {
  encodeSummaryCursor,
  parseSummaryCursor,
} from './prisma-summary-records';

const VISIBLE_BRIEFING_STATUSES = ['COMPLETED', 'NO_SIGNAL'] as const;

export class PrismaBriefingArtifactRepository implements BriefingArtifactRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(artifact: BriefingArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    const status = briefingArtifactStatusToPrisma(artifact);
    const artifactPayload = serializeBriefingArtifact(artifact);
    const scopeFields = briefingScopeToPrisma(snapshot.scope);

    await withPrismaWriteRetry(() => this.prisma.briefingArtifact.upsert({
      where: { id: snapshot.briefingId },
      update: {
        ...scopeFields,
        status,
        userId: snapshot.userId ?? null,
        subscriptionId: snapshot.subscriptionId ?? null,
        modelVersion: snapshot.lineage.modelVersion,
        promptVersion: snapshot.lineage.promptVersion,
        headline: snapshot.headline,
        summaryText: snapshot.executiveSummary,
        artifactPayload,
        citations: snapshot.citationMap,
        qualitySignals: briefingQualitySignalsToPrisma(artifact),
      },
      create: {
        id: snapshot.briefingId,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        ...scopeFields,
        userId: snapshot.userId ?? null,
        subscriptionId: snapshot.subscriptionId ?? null,
        status,
        schemaVersion: 1,
        modelVersion: snapshot.lineage.modelVersion,
        promptVersion: snapshot.lineage.promptVersion,
        headline: snapshot.headline,
        summaryText: snapshot.executiveSummary,
        artifactPayload,
        citations: snapshot.citationMap,
        qualitySignals: briefingQualitySignalsToPrisma(artifact),
      },
    }));
  }

  async list(query: ListBriefingArtifactsQuery): Promise<ListBriefingArtifactsResult> {
    const offset = parseSummaryCursor(query.cursor);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      scopeKey: query.scope === undefined ? undefined : briefingScopeKey(query.scope),
      status: { in: VISIBLE_BRIEFING_STATUSES },
    };
    const [records, total] = await Promise.all([
      this.prisma.briefingArtifact.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.briefingArtifact.count({ where }),
    ]);
    const items = records.map((record) => briefingArtifactFromPrisma(record));
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < total ? encodeSummaryCursor(nextOffset) : undefined,
    };
  }

  async findById(
    params: Parameters<BriefingArtifactRepositoryPort['findById']>[0],
  ): Promise<BriefingArtifact | null> {
    const record = await this.prisma.briefingArtifact.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.briefingId,
      },
    });

    return record === null ? null : briefingArtifactFromPrisma(record);
  }
}
