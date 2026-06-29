import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { SummaryPolicy } from '../../../domain';
import type { SummaryPolicyRepositoryPort } from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import { summaryPolicyFromPrisma } from './prisma-summary-records';

export class PrismaSummaryPolicyRepository implements SummaryPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(policy: SummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    const mutation = {
      language: snapshot.language,
      format: snapshot.format,
      tone: snapshot.tone,
      maxKeyPoints: snapshot.maxKeyPoints,
      includeRisks: snapshot.includeRisks,
      includeSourceHighlights: snapshot.includeSourceHighlights,
      customInstructions: snapshot.customInstructions ?? null,
      rulesVersion: snapshot.rulesVersion,
      updatedAt: snapshot.updatedAt,
    };

    await withPrismaWriteRetry(() => this.prisma.summaryPolicy.upsert({
      where: {
        tenantId_workspaceId_interestId: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          interestId: snapshot.interestId,
        },
      },
      update: mutation,
      create: {
        ...mutation,
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        interestId: snapshot.interestId,
        createdAt: snapshot.createdAt,
      },
    }));
  }

  async findByInterest(
    params: Parameters<SummaryPolicyRepositoryPort['findByInterest']>[0],
  ): Promise<SummaryPolicy | null> {
    const record = await this.prisma.summaryPolicy.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        interestId: params.interestId,
      },
    });

    return record === null ? null : summaryPolicyFromPrisma(record);
  }
}
