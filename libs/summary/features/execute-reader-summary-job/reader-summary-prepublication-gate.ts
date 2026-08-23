import {
  evaluateReaderSummaryGitHubProjection,
  exactUtcDay,
  githubProjectionItemTouchesDay,
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
  readonly readerQuality?: "limited_sources";
};

export const evaluateReaderSummaryPrepublication = async (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly evidence: SummaryEvidenceSelection;
  readonly editorialEvidence?: SummaryEvidenceSelection;
  readonly publicationPolicy: ReaderSummaryPublicationPolicy;
  readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  readonly observedThrough: Date;
  readonly historicalGitHubOmission?: ReaderSummaryHistoricalGitHubOmission;
  readonly recoveryProvenance?: ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort;
}): Promise<ReaderSummaryPrepublicationDecision> => {
  const publicationDecision = params.publicationPolicy.evaluate({
    artifact: params.artifact,
    evidence: params.evidence,
    editorialEvidence: params.editorialEvidence,
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown binding error";
      projection = unavailableReaderSummaryGitHubProjectionAudit({
        artifact: params.artifact,
        reason:
          `Verified Daily V4 recovery provenance could not be bound before publication: ${detail}`,
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
    try {
      const durable = await params.githubProjectionReader.read({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        dayStartedAt: snapshot.period.startedAt,
        dayEndedAt: snapshot.period.endedAt,
        observedThrough: params.observedThrough,
      });
      const canonical = evaluateReaderSummaryGitHubProjection({
        artifact: params.artifact,
        eligibleBindingIds: durable.eligibleBindingIds,
        items: durable.items,
        pageCount: durable.pageCount,
        observedThrough: params.observedThrough,
      });
      const requestedDayItemCount = durable.items.filter((item) =>
        githubProjectionItemTouchesDay(
          item,
          snapshot.period.startedAt,
          snapshot.period.endedAt,
        ),
      ).length;
      projection = Number.isSafeInteger(durable.pageCount) &&
          durable.pageCount >= 1 &&
          requestedDayItemCount === 0
        ? historicalOmissionReaderSummaryGitHubProjectionAudit({
            artifact: params.artifact,
            ...params.historicalGitHubOmission,
            observedThrough: params.observedThrough,
          })
        : canonical;
    } catch {
      projection = unavailableReaderSummaryGitHubProjectionAudit({
        artifact: params.artifact,
        reason:
          "Durable GitHub projection could not prove canonical zero before historical omission.",
      });
    }
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
  const baseFields = [
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
  ] as const;
  if (!isNonArrayRecord(recovery)) {
    return false;
  }
  const record = recovery;
  const isV3 = "canonicalOutputSha256" in provenance;
  const fields = isV3
    ? [
        ...baseFields,
        "canonicalOutputSha256",
        "canonicalOutputByteLength",
        "rawOutputSha256",
        "rawOutputByteLength",
        "githubProjectionSha256",
      ]
    : [
        ...baseFields,
        "outputTextSha256",
        "outputTextByteLength",
        "githubProjectionSha256",
      ];
  if (
    Object.keys(record).length !== fields.length ||
    fields.some(
      (field) => !Object.prototype.hasOwnProperty.call(record, field),
    )
  ) {
    return false;
  }
  const commonMatches =
    record.recoveryVersion === provenance.recoveryVersion &&
    record.selectedOutputKind === provenance.selectedOutputKind &&
    record.sourceAuthoritySchemaVersion === provenance.sourceAuthoritySchemaVersion &&
    record.tenantId === provenance.tenantId &&
    record.workspaceId === provenance.workspaceId &&
    record.requestedUtcDate === provenance.requestedUtcDate &&
    record.ingestionCutoff === provenance.ingestionCutoff &&
    record.sourceAuthoritySha256 === provenance.sourceAuthoritySha256 &&
    record.modelJobIdentity === provenance.modelJobIdentity &&
    record.githubProjectionSha256 === provenance.githubProjectionSha256;
  if (!commonMatches) return false;
  if (isV3) {
    return record.schemaVersion ===
        "reader_summary.daily_canonical_recovery_provenance.v3" &&
      record.canonicalOutputSha256 === provenance.canonicalOutputSha256 &&
      record.canonicalOutputByteLength === provenance.canonicalOutputByteLength &&
      record.rawOutputSha256 === provenance.rawOutputSha256 &&
      record.rawOutputByteLength === provenance.rawOutputByteLength;
  }
  return record.schemaVersion ===
      "reader_summary.daily_canonical_recovery_provenance.v2" &&
    record.outputTextSha256 === provenance.outputTextSha256 &&
    record.outputTextByteLength === provenance.outputTextByteLength;
};

const isNonArrayRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
