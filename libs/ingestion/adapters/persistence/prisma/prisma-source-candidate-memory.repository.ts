import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type { IdGenerator } from "@social-monitor/shared-kernel";

import { sourceCandidateMemoryRecordIsActive } from "../../../domain/policies/source-candidate-memory-policy";
import type {
  RememberSourceCandidatesCommand,
  ScreenSourceCandidatesCommand,
  ScreenSourceCandidatesResult,
  SourceCandidateMemoryDecision,
  SourceCandidateMemoryPort,
  SourceCandidateMemoryReasonCode,
  SourceCandidateMemoryRecord,
} from "../../../ports/source-candidate-memory.port";
import type { PrismaSourceCandidateMemoryClient } from "./prisma-ingestion-client";
import type { PrismaSourceCandidateMemoryRecord } from "./prisma-ingestion-records";

export class PrismaSourceCandidateMemoryRepository implements SourceCandidateMemoryPort {
  constructor(
    private readonly prisma: PrismaSourceCandidateMemoryClient,
    private readonly ids: IdGenerator,
  ) {}

  async screen(
    command: ScreenSourceCandidatesCommand,
  ): Promise<ScreenSourceCandidatesResult> {
    if (command.candidates.length === 0) {
      return { suppressedExternalIds: [], activeRecords: [] };
    }

    const records = await this.prisma.sourceCandidateMemory.findMany({
      where: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
        providerKey: command.providerKey,
        scopeFingerprint: command.scopeFingerprint,
        policyVersion: command.policyVersion,
        providerItemId: {
          in: command.candidates.map((candidate) => candidate.externalId),
        },
        expiresAt: { gt: command.screenedAt },
      },
    });
    const candidateByExternalId = new Map(
      command.candidates.map((candidate) => [candidate.externalId, candidate]),
    );
    const activeRecords = records.flatMap((record) => {
      const candidate = candidateByExternalId.get(record.providerItemId);
      if (candidate === undefined) {
        return [];
      }
      const memoryRecord = sourceCandidateMemoryFromPrisma(record);

      return sourceCandidateMemoryRecordIsActive({
        record: memoryRecord,
        scope: command,
        candidate,
        now: command.screenedAt,
      })
        ? [memoryRecord]
        : [];
    });

    return {
      suppressedExternalIds: activeRecords.map((record) => record.externalId),
      activeRecords,
    };
  }

  async remember(command: RememberSourceCandidatesCommand): Promise<void> {
    const expired = await this.prisma.sourceCandidateMemory.findMany({
      where: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        expiresAt: { lte: command.rememberedAt },
      },
      orderBy: { expiresAt: "asc" },
      take: 500,
    });
    if (expired.length > 0) {
      await withPrismaWriteRetry(() =>
        this.prisma.sourceCandidateMemory.deleteMany({
          where: {
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            id: { in: expired.map((record) => record.id) },
          },
        }),
      );
    }
    for (const candidate of command.candidates) {
      const scopeKey = {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
        providerKey: command.providerKey,
        scopeFingerprint: command.scopeFingerprint,
        providerItemId: candidate.externalId,
      };
      await withPrismaWriteRetry(() =>
        this.prisma.sourceCandidateMemory.upsert({
          where: {
            tenantId_workspaceId_interestId_sourceBindingId_providerKey_scopeFingerprint_providerItemId:
              scopeKey,
          },
          update: {
            fingerprint: candidate.fingerprint,
            policyVersion: command.policyVersion,
            decision: candidate.decision,
            reasonCode: candidate.reasonCode,
            expiresAt: candidate.expiresAt,
            lastSeenAt: command.rememberedAt,
            seenCount: { increment: 1 },
          },
          create: {
            id: this.ids.generate(),
            ...scopeKey,
            fingerprint: candidate.fingerprint,
            policyVersion: command.policyVersion,
            decision: candidate.decision,
            reasonCode: candidate.reasonCode,
            expiresAt: candidate.expiresAt,
            firstSeenAt: command.rememberedAt,
            lastSeenAt: command.rememberedAt,
          },
        }),
      );
    }
  }
}

const sourceCandidateMemoryFromPrisma = (
  record: PrismaSourceCandidateMemoryRecord,
): SourceCandidateMemoryRecord => ({
  tenantId: record.tenantId as SourceCandidateMemoryRecord["tenantId"],
  workspaceId: record.workspaceId as SourceCandidateMemoryRecord["workspaceId"],
  interestId: record.interestId,
  sourceBindingId: record.sourceBindingId,
  providerKey: record.providerKey,
  scopeFingerprint: record.scopeFingerprint,
  policyVersion: record.policyVersion,
  externalId: record.providerItemId,
  fingerprint: record.fingerprint,
  decision: readDecision(record.decision),
  reasonCode: readReasonCode(record.reasonCode),
  expiresAt: record.expiresAt,
  firstSeenAt: record.firstSeenAt,
  lastSeenAt: record.lastSeenAt,
  seenCount: record.seenCount,
});

const readDecision = (value: string): SourceCandidateMemoryDecision => {
  if (value === "processed" || value === "rejected") {
    return value;
  }
  throw new Error(`Unsupported source candidate memory decision: ${value}`);
};

const reasonCodes: readonly SourceCandidateMemoryReasonCode[] = [
  "already_processed",
  "ranked_out",
  "below_threshold",
  "author_diversity",
  "outside_window",
  "invalid_payload",
  "low_relevance",
  "muted",
  "provider_duplicate",
];

const readReasonCode = (value: string): SourceCandidateMemoryReasonCode => {
  if (reasonCodes.includes(value as SourceCandidateMemoryReasonCode)) {
    return value as SourceCandidateMemoryReasonCode;
  }
  throw new Error(`Unsupported source candidate memory reason: ${value}`);
};
