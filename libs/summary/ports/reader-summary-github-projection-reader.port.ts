import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifact,
  ReaderSummaryGitHubProjectionAudit,
  ReaderSummaryGitHubProjectionEvaluation,
  ReaderSummaryGitHubProjectionItem,
  SummaryEvidenceSelection,
} from "../domain";

export type ReadReaderSummaryGitHubProjectionQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly dayStartedAt: Date;
  readonly dayEndedAt: Date;
  readonly observedThrough: Date;
};

export type ReadReaderSummaryGitHubProjectionResult = {
  readonly eligibleBindingIds: readonly string[];
  readonly items: readonly ReaderSummaryGitHubProjectionItem[];
  readonly pageCount: number;
};

export interface ReaderSummaryGitHubProjectionReaderPort {
  read(
    query: ReadReaderSummaryGitHubProjectionQuery,
  ): Promise<ReadReaderSummaryGitHubProjectionResult>;
}

/**
 * Serialized only inside a V4 recovery audit. This is adapter provenance, not
 * a general-purpose domain value object. It is untrusted until the
 * role-gated PostgreSQL verifier accepts the persisted record.
 */
export type ReaderSummaryDailyCanonicalRecoveryV4Binding = Readonly<{
  /** The closed 13-field record PostgreSQL re-verifies before use. */
  schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v2";
  recoveryVersion: "reader_summary.daily_canonical_recovery.v4";
  selectedOutputKind: "output_text";
  sourceAuthoritySchemaVersion: 2;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  ingestionCutoff: string;
  sourceAuthoritySha256: string;
  modelJobIdentity: string;
  outputTextSha256: string;
  outputTextByteLength: number;
  githubProjectionSha256: string;
}>;

export type ReaderSummaryDailyCanonicalRecoveryV4Audit =
  ReaderSummaryGitHubProjectionAudit & Readonly<{
    recoveryV4: ReaderSummaryDailyCanonicalRecoveryV4Binding;
  }>;

/**
 * This port is deliberately narrower than the ordinary projection reader.
 * It can only propose a prepublication audit. The Prisma repository and
 * fenced finalization own acceptance through the database predicate.
 */
export interface ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort {
  readonly recoveryVersion: "reader_summary.daily_canonical_recovery.v4";
  readonly selectedOutputKind: "output_text";
  readonly sourceAuthoritySchemaVersion: 2;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestedUtcDate: string;
  readonly ingestionCutoff: string;
  readonly sourceAuthoritySha256: string;
  readonly modelJobIdentity: string;
  readonly outputTextSha256: string;
  readonly outputTextByteLength: number;
  readonly githubProjectionSha256: string;

  verifyPrepublication(input: Readonly<{
    artifact: ReaderSummaryArtifact;
    evidence: SummaryEvidenceSelection;
    observedThrough: Date;
  }>): ReaderSummaryGitHubProjectionEvaluation;
}

export const UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER: ReaderSummaryGitHubProjectionReaderPort =
  {
    async read(): Promise<ReadReaderSummaryGitHubProjectionResult> {
      throw new Error("Durable GitHub projection reader is unavailable");
    },
  };
