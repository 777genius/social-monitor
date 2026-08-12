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
type ReaderSummaryDailyCanonicalRecoveryV4BindingBase = Readonly<{
  schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v3";
  recoveryVersion: "reader_summary.daily_canonical_recovery.v4";
  selectedOutputKind: "output_text";
  sourceAuthoritySchemaVersion: 2;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  ingestionCutoff: string;
  sourceAuthoritySha256: string;
  modelJobIdentity: string;
  githubProjectionSha256: string;
}>;

/** Preserved historical V2 record; normal 13-field reads remain compatible. */
export type ReaderSummaryDailyCanonicalRecoveryV4BindingV2 =
  Omit<ReaderSummaryDailyCanonicalRecoveryV4BindingBase, "schemaVersion"> & Readonly<{
    schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v2";
    outputTextSha256: string;
    outputTextByteLength: number;
  }>;

/** The closed 15-field raw/canonical record PostgreSQL re-verifies before use. */
export type ReaderSummaryDailyCanonicalRecoveryV4BindingV3 =
  ReaderSummaryDailyCanonicalRecoveryV4BindingBase & Readonly<{
  canonicalOutputSha256: string;
  canonicalOutputByteLength: number;
  rawOutputSha256: string;
  rawOutputByteLength: number;
}>;

export type ReaderSummaryDailyCanonicalRecoveryV4Binding =
  | ReaderSummaryDailyCanonicalRecoveryV4BindingV2
  | ReaderSummaryDailyCanonicalRecoveryV4BindingV3;

export type ReaderSummaryDailyCanonicalRecoveryV4Audit =
  ReaderSummaryGitHubProjectionAudit & Readonly<{
    recoveryV4: ReaderSummaryDailyCanonicalRecoveryV4Binding;
  }>;

/**
 * This port is deliberately narrower than the ordinary projection reader.
 * It can only propose a prepublication audit. The Prisma repository and
 * fenced finalization own acceptance through the database predicate.
 */
type ReaderSummaryDailyCanonicalRecoveryV4ProvenancePortBase = Readonly<{
  readonly recoveryVersion: "reader_summary.daily_canonical_recovery.v4";
  readonly selectedOutputKind: "output_text";
  readonly sourceAuthoritySchemaVersion: 2;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestedUtcDate: string;
  readonly ingestionCutoff: string;
  readonly sourceAuthoritySha256: string;
  readonly modelJobIdentity: string;
  readonly githubProjectionSha256: string;

  verifyPrepublication(input: Readonly<{
    artifact: ReaderSummaryArtifact;
    evidence: SummaryEvidenceSelection;
    observedThrough: Date;
  }>): ReaderSummaryGitHubProjectionEvaluation;
}>;

/** Kept for already-persisted 13-field V2 recovery flows. */
export type ReaderSummaryDailyCanonicalRecoveryV4ProvenancePortV2 =
  ReaderSummaryDailyCanonicalRecoveryV4ProvenancePortBase & Readonly<{
  readonly outputTextSha256: string;
  readonly outputTextByteLength: number;
}>;

/** V3 adds independent transient-raw and durable-canonical bindings. */
export type ReaderSummaryDailyCanonicalRecoveryV4ProvenancePortV3 =
  ReaderSummaryDailyCanonicalRecoveryV4ProvenancePortBase & Readonly<{
  readonly canonicalOutputSha256: string;
  readonly canonicalOutputByteLength: number;
  readonly rawOutputSha256: string;
  readonly rawOutputByteLength: number;
}>;

/** Both closed records are accepted; fresh V4 publication emits V3 only. */
export type ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort =
  | ReaderSummaryDailyCanonicalRecoveryV4ProvenancePortV2
  | ReaderSummaryDailyCanonicalRecoveryV4ProvenancePortV3;

export const UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER: ReaderSummaryGitHubProjectionReaderPort =
  {
    async read(): Promise<ReadReaderSummaryGitHubProjectionResult> {
      throw new Error("Durable GitHub projection reader is unavailable");
    },
  };
