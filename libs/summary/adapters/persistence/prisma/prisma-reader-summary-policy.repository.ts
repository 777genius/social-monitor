import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from "@social-monitor/platform-persistence";
import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

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
    assertOptionalScopeIsComplete(query);
    const listScheduled = () =>
      this.prisma.readerSummaryPolicy.findMany({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          scheduleEnabled: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: query.limit,
      });
    const records =
      query.tenantId === undefined
        ? await runWithSystemDatabaseAccess(
            "cross-tenant reader summary policy polling",
            listScheduled,
          )
        : await listScheduled();

    return records.map(readerSummaryPolicyFromPrisma);
  }
}

const assertOptionalScopeIsComplete = (scope: {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
}): void => {
  if ((scope.tenantId === undefined) !== (scope.workspaceId === undefined)) {
    throw new Error(
      "Reader summary policy scope must include tenant and workspace",
    );
  }
};
