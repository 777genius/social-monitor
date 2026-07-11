import { sourceCandidateMemoryRecordIsActive } from "../../domain/policies/source-candidate-memory-policy";
import type {
  RememberSourceCandidatesCommand,
  ScreenSourceCandidatesCommand,
  ScreenSourceCandidatesResult,
  SourceCandidateMemoryPort,
  SourceCandidateMemoryRecord,
  SourceCandidateMemoryScope,
} from "../../ports/source-candidate-memory.port";

export class InMemorySourceCandidateMemoryRepository implements SourceCandidateMemoryPort {
  private readonly recordsByKey = new Map<
    string,
    SourceCandidateMemoryRecord
  >();

  async screen(
    command: ScreenSourceCandidatesCommand,
  ): Promise<ScreenSourceCandidatesResult> {
    const activeRecords = command.candidates.flatMap((candidate) => {
      const record = this.recordsByKey.get(
        memoryKey(command, candidate.externalId),
      );

      return record !== undefined &&
        sourceCandidateMemoryRecordIsActive({
          record,
          scope: command,
          candidate,
          now: command.screenedAt,
        })
        ? [record]
        : [];
    });

    return {
      suppressedExternalIds: activeRecords.map((record) => record.externalId),
      activeRecords,
    };
  }

  async remember(command: RememberSourceCandidatesCommand): Promise<void> {
    for (const candidate of command.candidates) {
      const key = memoryKey(command, candidate.externalId);
      const existing = this.recordsByKey.get(key);
      this.recordsByKey.set(key, {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
        providerKey: command.providerKey,
        scopeFingerprint: command.scopeFingerprint,
        policyVersion: command.policyVersion,
        externalId: candidate.externalId,
        fingerprint: candidate.fingerprint,
        decision: candidate.decision,
        reasonCode: candidate.reasonCode,
        expiresAt: candidate.expiresAt,
        firstSeenAt: existing?.firstSeenAt ?? command.rememberedAt,
        lastSeenAt: command.rememberedAt,
        seenCount: (existing?.seenCount ?? 0) + 1,
      });
    }
  }

  all(): readonly SourceCandidateMemoryRecord[] {
    return [...this.recordsByKey.values()];
  }
}

const memoryKey = (
  scope: SourceCandidateMemoryScope,
  externalId: string,
): string =>
  [
    scope.tenantId,
    scope.workspaceId,
    scope.interestId,
    scope.sourceBindingId,
    scope.providerKey,
    scope.scopeFingerprint,
    externalId,
  ].join(":");
