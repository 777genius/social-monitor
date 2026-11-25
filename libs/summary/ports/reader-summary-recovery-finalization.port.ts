import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationOutcome,
} from "./reader-summary-publication.port";
import type { ReaderSummaryJob } from "../domain";

export type ReaderSummaryRecoveryArtifactDigest = Readonly<{
  artifactFormat: string;
  sha256: string;
}>;

export type ReaderSummaryRecoveryProvenance = Readonly<{
  schemaVersion: "reader_summary.summary_only_recovery_provenance.v1";
  mode: "summary-only";
  collectionUtcPeriod: Readonly<{
    startedAt: string;
    endedAt: string;
    timezone: string;
  }>;
  priorCollectionProof: Readonly<{
    sourceAttempt: ReaderSummaryRecoveryArtifactDigest;
    collectionArtifact: ReaderSummaryRecoveryArtifactDigest;
    collectionQualityReport: ReaderSummaryRecoveryArtifactDigest;
  }>;
  regenerationInputManifest: ReaderSummaryRecoveryArtifactDigest &
    Readonly<{
      datasetSha256: string;
    }>;
}>;

export type ReaderSummaryRecoveryFinalizationCommand = Readonly<{
  publication: ReaderSummaryPublicationCommand;
  provenance: ReaderSummaryRecoveryProvenance;
  candidate?: Readonly<{
    runningJob: ReaderSummaryJob;
  }>;
}>;

export type ReaderSummaryRecoveryFinalizationOutcome = Exclude<
  ReaderSummaryPublicationOutcome,
  "stale"
>;

export interface ReaderSummaryRecoveryFinalizationPort {
  finalize(
    command: ReaderSummaryRecoveryFinalizationCommand,
  ): Promise<ReaderSummaryRecoveryFinalizationOutcome>;
}
