import { readerSummaryScopeKey } from "../../domain";
import type { ReaderSummaryWeeklyArtifactSnapshot } from "../../domain/entities/reader-summary-weekly-artifact";
import {
  readReaderSummaryWeeklyPublicationAuthorization,
  type ReaderSummaryWeeklyPublicationProof,
  type ReaderSummaryWeeklyPublicationQualitySignals,
} from "../../domain/policies/reader-summary-weekly-publication-authorization";
import { canonicalizeReaderSummaryWeeklyJson } from "../../domain/value-objects/reader-summary-weekly-canonical-json";
import type { SaveReaderSummaryWeeklyArtifactCommand } from "../../ports";

export type ReaderSummaryWeeklyPersistedQualitySignals =
  ReaderSummaryWeeklyPublicationQualitySignals &
    Readonly<{
      weeklyPublicationProof: ReaderSummaryWeeklyPublicationProof;
    }>;

export type ReaderSummaryWeeklyPublicationPersistencePayload = Readonly<{
  schemaVersion: "reader_summary.weekly_artifact_persistence.v2";
  artifactId: string;
  tenantId: string;
  workspaceId: string;
  scopeType: "workspace" | "interest";
  scopeKey: string;
  interestId: string | null;
  cadence: "weekly";
  weekStartedOn: string;
  weekEndedOn: string;
  periodStartedAt: string;
  periodEndedAt: string;
  periodTimezone: "UTC";
  periodKey: string;
  sealId: string;
  sealSha256: string;
  manifestSealId: string;
  manifestSealSha256: string;
  headline: string;
  summaryText: string;
  modelVersion: string;
  promptVersion: string;
  artifactPayload: Readonly<{
    schemaVersion: "reader_summary.weekly_persisted_artifact.v1";
    output: ReaderSummaryWeeklyArtifactSnapshot["output"];
    publicationProof: ReaderSummaryWeeklyPublicationProof;
  }>;
  artifactPayloadSha256: string;
  citations: readonly Readonly<Record<string, unknown>>[];
  qualitySignals: ReaderSummaryWeeklyPersistedQualitySignals;
  proof: ReaderSummaryWeeklyPublicationProof;
}>;

export type ReaderSummaryWeeklyPublicationPersistenceSqlRow = Readonly<{
  outcome: "persisted" | "replayed";
  artifact_id: string;
  artifact_payload_sha256: string;
  proof_sha256: string;
}>;

export const buildReaderSummaryWeeklyPublicationPersistencePayload = (
  command: SaveReaderSummaryWeeklyArtifactCommand,
): ReaderSummaryWeeklyPublicationPersistencePayload => {
  if (command.kind !== "weekly") {
    throw new Error(
      "Reader summary weekly persistence requires a weekly authorization",
    );
  }
  const details = readReaderSummaryWeeklyPublicationAuthorization(
    command.authorization,
  );
  if (details.artifactId !== command.artifactId) {
    throw new Error(
      "Reader summary weekly authorization is bound to another artifact",
    );
  }

  const { artifact, proof } = details;
  const periodStartedAt = `${proof.weekStartedOn}T00:00:00.000Z`;
  const periodEndedAt = new Date(
    Date.parse(`${proof.weekEndedOn}T00:00:00.000Z`) + 86_400_000,
  ).toISOString();
  const scopeKey = readerSummaryScopeKey(proof.scope);
  const artifactPayload = {
    schemaVersion: "reader_summary.weekly_persisted_artifact.v1" as const,
    output: artifact.output,
    publicationProof: proof,
  };

  return {
    schemaVersion: "reader_summary.weekly_artifact_persistence.v2",
    artifactId: details.artifactId,
    tenantId: proof.tenantId,
    workspaceId: proof.workspaceId,
    scopeType: proof.scope.type,
    scopeKey,
    interestId:
      proof.scope.type === "interest" ? proof.scope.interestId : null,
    cadence: "weekly",
    weekStartedOn: proof.weekStartedOn,
    weekEndedOn: proof.weekEndedOn,
    periodStartedAt,
    periodEndedAt,
    periodTimezone: "UTC",
    periodKey: `weekly:${periodStartedAt}:${periodEndedAt}:UTC`,
    sealId: artifact.output.sealId,
    sealSha256: artifact.output.sealSha,
    manifestSealId: proof.manifestSealId,
    manifestSealSha256: proof.manifestSealSha256,
    headline: artifact.output.headline,
    summaryText: artifact.output.synthesis,
    modelVersion: artifact.output.schemaVersion,
    promptVersion: artifact.editorialQuality.policyVersion,
    artifactPayload,
    artifactPayloadSha256: canonicalizeReaderSummaryWeeklyJson(
      artifactPayload,
      "weekly persisted artifact payload",
    ).sha256,
    citations: proof.citations.map((citation) => ({ ...citation })),
    qualitySignals: {
      ...details.qualitySignals,
      weeklyPublicationProof: proof,
    },
    proof,
  };
};
