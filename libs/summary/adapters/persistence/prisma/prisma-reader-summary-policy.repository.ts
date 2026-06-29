import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import {
  readerSummaryScopeKey,
  type ReaderSummaryPolicy,
} from "../../../domain";
import type { ReaderSummaryPolicyRepositoryPort } from "../../../ports";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  readerSummaryPolicyFromPrisma,
  readerSummaryScopeToPrisma,
} from "./prisma-reader-summary-records";

export class PrismaReaderSummaryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(policy: ReaderSummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    const scopeFields = readerSummaryScopeToPrisma(snapshot.scope);
    const mutation = {
      ...scopeFields,
      language: snapshot.language,
      format: snapshot.format,
      tone: snapshot.tone,
      maxStories: snapshot.maxStories,
      includeRisks: snapshot.includeRisks,
      includeInterestHighlights: snapshot.includeInterestHighlights,
      includeRepeatedSignals: snapshot.includeRepeatedSignals,
      dedupeStrategy: snapshot.dedupeStrategy,
      customInstructions: snapshot.customInstructions ?? null,
      rulesVersion: snapshot.rulesVersion,
      scheduleEnabled: snapshot.schedule.enabled,
      scheduleTimezone: snapshot.schedule.timezone,
      scheduleCadences: [...snapshot.schedule.cadences],
      updatedAt: snapshot.updatedAt,
    };

    await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryPolicy.upsert({
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
      }),
    );
  }

  async findByScope(
    params: Parameters<ReaderSummaryPolicyRepositoryPort["findByScope"]>[0],
  ): Promise<ReaderSummaryPolicy | null> {
    const record = await this.prisma.readerSummaryPolicy.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scopeKey: readerSummaryScopeKey(params.scope),
      },
    });

    return record === null ? null : readerSummaryPolicyFromPrisma(record);
  }

  async listScheduled(
    query: Parameters<ReaderSummaryPolicyRepositoryPort["listScheduled"]>[0],
  ): Promise<readonly ReaderSummaryPolicy[]> {
    const records = await this.prisma.readerSummaryPolicy.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        scheduleEnabled: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit,
    });

    return records.map(readerSummaryPolicyFromPrisma);
  }
}
