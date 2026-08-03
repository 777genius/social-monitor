import {
  evaluateReaderSummaryGitHubProjection,
  exactUtcDay,
  historicalOmissionReaderSummaryGitHubProjectionAudit,
  notApplicableReaderSummaryGitHubProjectionAudit,
  unavailableReaderSummaryGitHubProjectionAudit,
  withReaderSummaryPublicationRejections,
  type ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
  type ReaderSummaryGitHubProjectionEvaluation,
  type ReaderSummaryPublicationDecision,
  type ReaderSummaryPublicationPolicy,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  type ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort,
  type ReaderSummaryDailyCanonicalRecoveryV4Audit,
  type ReaderSummaryGitHubProjectionReaderPort,
} from "../../ports";

export type ReaderSummaryPrepublicationDecision = {
  readonly publicationDecision: ReaderSummaryPublicationDecision;
  readonly githubProjectionAudit: ReaderSummaryGitHubProjectionAudit;
};

export type ReaderSummaryHistoricalGitHubOmission = {
  readonly reason: string;
  readonly authorizedAt: Date;
};

export const evaluateReaderSummaryPrepublication = async (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly evidence: SummaryEvidenceSelection;
  readonly publicationPolicy: ReaderSummaryPublicationPolicy;
  readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  readonly observedThrough: Date;
  readonly historicalGitHubOmission?: ReaderSummaryHistoricalGitHubOmission;
  readonly recoveryProvenance?: ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort;
}): Promise<ReaderSummaryPrepublicationDecision> => {
  const publicationDecision = params.publicationPolicy.evaluate({
    artifact: params.artifact,
    evidence: params.evidence,
  });
  const snapshot = params.artifact.toSnapshot();
  let projection: ReaderSummaryGitHubProjectionEvaluation;
  if (params.recoveryProvenance !== undefined) {
    try {
      projection = params.recoveryProvenance.verifyPrepublication({
        artifact: params.artifact,
        evidence: params.evidence,
        observedThrough: params.observedThrough,
      });
      if (!isRecoveryAuditForProvenance(
        projection.audit,
        params.recoveryProvenance,
      )) {
        throw new Error("Daily V4 recovery audit does not bind provenance");
      }
    } catch {
      projection = unavailableReaderSummaryGitHubProjectionAudit({
        artifact: params.artifact,
        reason:
          "Verified Daily V4 recovery provenance could not be bound before publication.",
      });
    }
  } else if (
    exactUtcDay(
      snapshot.period.startedAt,
      snapshot.period.endedAt,
      snapshot.period.timezone,
    ) === undefined
  ) {
    projection = notApplicableReaderSummaryGitHubProjectionAudit({
      artifact: params.artifact,
    });
  } else if (params.historicalGitHubOmission !== undefined) {
    projection = historicalOmissionReaderSummaryGitHubProjectionAudit({
      artifact: params.artifact,
      ...params.historicalGitHubOmission,
    });
  } else {
    try {
      const durable = await params.githubProjectionReader.read({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        dayStartedAt: snapshot.period.startedAt,
        dayEndedAt: snapshot.period.endedAt,
        observedThrough: params.observedThrough,
      });
      projection = evaluateReaderSummaryGitHubProjection({
        artifact: params.artifact,
        eligibleBindingIds: durable.eligibleBindingIds,
        items: durable.items,
        pageCount: durable.pageCount,
        observedThrough: params.observedThrough,
      });
    } catch {
      projection = unavailableReaderSummaryGitHubProjectionAudit({
        artifact: params.artifact,
        reason:
          "Durable GitHub projection could not be read before publication.",
      });
    }
  }

  return {
    publicationDecision: withReaderSummaryPublicationRejections({
      decision: publicationDecision,
      findings: projection.findings,
    }),
    githubProjectionAudit: projection.audit,
  };
};

const isRecoveryAuditForProvenance = (
  audit: ReaderSummaryGitHubProjectionAudit,
  provenance: ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort,
): audit is ReaderSummaryDailyCanonicalRecoveryV4Audit => {
  if (!Object.prototype.hasOwnProperty.call(audit, "recoveryV4")) {
    return false;
  }
  const recovery = (audit as Readonly<Record<string, unknown>>).recoveryV4;
  const fields = [
    "schemaVersion",
    "recoveryVersion",
    "selectedOutputKind",
    "sourceAuthoritySchemaVersion",
    "tenantId",
    "workspaceId",
    "requestedUtcDate",
    "ingestionCutoff",
    "sourceAuthoritySha256",
    "modelJobIdentity",
    "outputTextSha256",
    "outputTextByteLength",
    "githubProjectionSha256",
  ] as const;
  if (!isNonArrayRecord(recovery)) {
    return false;
  }
  const record = recovery;
  if (
    Object.keys(record).length !== fields.length ||
    fields.some(
      (field) => !Object.prototype.hasOwnProperty.call(record, field),
    )
  ) {
    return false;
  }
  return record.schemaVersion ===
      "reader_summary.daily_canonical_recovery_provenance.v2" &&
    record.recoveryVersion === provenance.recoveryVersion &&
    record.selectedOutputKind === provenance.selectedOutputKind &&
    record.sourceAuthoritySchemaVersion === provenance.sourceAuthoritySchemaVersion &&
    record.tenantId === provenance.tenantId &&
    record.workspaceId === provenance.workspaceId &&
    record.requestedUtcDate === provenance.requestedUtcDate &&
    record.ingestionCutoff === provenance.ingestionCutoff &&
    record.sourceAuthoritySha256 === provenance.sourceAuthoritySha256 &&
    record.modelJobIdentity === provenance.modelJobIdentity &&
    record.outputTextSha256 === provenance.outputTextSha256 &&
    record.outputTextByteLength === provenance.outputTextByteLength &&
    record.githubProjectionSha256 === provenance.githubProjectionSha256;
};

const isNonArrayRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
