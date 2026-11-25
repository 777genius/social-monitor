import type {
  SourceCandidateMemoryCandidate,
  SourceCandidateMemoryDecision,
  SourceCandidateMemoryReasonCode,
  SourceCandidateMemoryRecord,
  SourceCandidateMemoryScope,
} from "../domain/policies/source-candidate-memory-policy";

export type {
  SourceCandidateMemoryCandidate,
  SourceCandidateChangeClassification,
  SourceCandidateChangeKind,
  SourceCandidateMemoryDecision,
  SourceCandidateMemoryReasonCode,
  SourceCandidateMemoryRecord,
  SourceCandidateMemoryScope,
} from "../domain/policies/source-candidate-memory-policy";

export type ScreenSourceCandidatesCommand = SourceCandidateMemoryScope & {
  readonly candidates: readonly SourceCandidateMemoryCandidate[];
  readonly screenedAt: Date;
};

export type ScreenSourceCandidatesResult = {
  readonly suppressedExternalIds: readonly string[];
  readonly activeRecords: readonly SourceCandidateMemoryRecord[];
  readonly records?: readonly SourceCandidateMemoryRecord[];
};

export type RememberSourceCandidate = SourceCandidateMemoryCandidate & {
  readonly decision: SourceCandidateMemoryDecision;
  readonly reasonCode: SourceCandidateMemoryReasonCode;
  readonly expiresAt: Date;
};

export type RememberSourceCandidatesCommand = SourceCandidateMemoryScope & {
  readonly candidates: readonly RememberSourceCandidate[];
  readonly rememberedAt: Date;
};

export interface SourceCandidateMemoryPort {
  screen(
    command: ScreenSourceCandidatesCommand,
  ): Promise<ScreenSourceCandidatesResult>;
  remember(command: RememberSourceCandidatesCommand): Promise<void>;
}

export const NOOP_SOURCE_CANDIDATE_MEMORY: SourceCandidateMemoryPort = {
  async screen() {
    return { suppressedExternalIds: [], activeRecords: [] };
  },
  async remember() {},
};
