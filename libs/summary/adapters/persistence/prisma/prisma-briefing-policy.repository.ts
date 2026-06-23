import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import { briefingScopeKey, type BriefingPolicy } from '../../../domain';
import type { BriefingPolicyRepositoryPort } from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import {
  briefingPolicyFromPrisma,
  briefingScopeToPrisma,
} from './prisma-briefing-records';

export class PrismaBriefingPolicyRepository implements BriefingPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(policy: BriefingPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    const scopeFields = briefingScopeToPrisma(snapshot.scope);
    const mutation = {
      ...scopeFields,
      language: snapshot.language,
      format: snapshot.format,
      tone: snapshot.tone,
      maxStories: snapshot.maxStories,
      includeRisks: snapshot.includeRisks,
      includeTopicHighlights: snapshot.includeTopicHighlights,
      includeRepeatedSignals: snapshot.includeRepeatedSignals,
      dedupeStrategy: snapshot.dedupeStrategy,
      customInstructions: snapshot.customInstructions ?? null,
      rulesVersion: snapshot.rulesVersion,
      updatedAt: snapshot.updatedAt,
    };

    await withPrismaWriteRetry(() => this.prisma.briefingPolicy.upsert({
      where: {
        tenantId_workspaceId_scopeKey: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          scopeKey: scopeFields.scopeKey,
        },
      },
      update: mutation,
      create: {
        ...mutation,
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        createdAt: snapshot.createdAt,
      },
    }));
  }

  async findByScope(
    params: Parameters<BriefingPolicyRepositoryPort['findByScope']>[0],
  ): Promise<BriefingPolicy | null> {
    const record = await this.prisma.briefingPolicy.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scopeKey: briefingScopeKey(params.scope),
      },
    });

    return record === null ? null : briefingPolicyFromPrisma(record);
  }
}
