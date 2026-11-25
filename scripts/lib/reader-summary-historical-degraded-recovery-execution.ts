import { createHash } from "node:crypto";

import {
  ReaderSummaryArtifact,
  ReaderSummaryJob,
  historicalOmissionReaderSummaryGitHubProjectionAudit,
  readerSummaryHasNoGitHubEvidence,
  type ReaderSummaryPublicationDecision,
  type ReaderSummaryReadyEvent,
} from "@social-monitor/summary/domain";
import type {
  ReaderSummaryRecoveryFinalizationCommand,
  ReaderSummaryRecoveryFinalizationPort,
} from "@social-monitor/summary/ports";
import { causationId, correlationId, eventId } from "@social-monitor/shared-kernel";

import {
  historicalDegradedRecoveryAuthorityFormat,
  sha256,
  verifyHistoricalDegradedRecoveryAuthorityBytes,
  type HistoricalDegradedRecoveryAuthority,
} from "./reader-summary-historical-degraded-recovery-authority";

export type HistoricalDegradedRecoveryFiles = Readonly<{
  collectionArtifactBytes: Buffer;
  collectionQualityReportBytes: Buffer;
  datasetManifestBytes: Buffer;
  xBackfillReceiptBytes: Buffer;
}>;

export type HistoricalDegradedRecoveryLiveVerification = Readonly<{
  sourceArtifact: ReaderSummaryArtifact;
  sourcePublicationDecision: Extract<
    ReaderSummaryPublicationDecision,
    { readonly status: "rejected" }
  >;
}>;

export interface HistoricalDegradedRecoveryLiveVerifier {
  verify(params: Readonly<{
    authority: HistoricalDegradedRecoveryAuthority;
    authoritySha256: string;
    files: HistoricalDegradedRecoveryFiles;
  }>): Promise<HistoricalDegradedRecoveryLiveVerification>;
  verifyPublicationSlot(params: Readonly<{
    authority: HistoricalDegradedRecoveryAuthority;
    authoritySha256: string;
    command: ReaderSummaryRecoveryFinalizationCommand;
    files: HistoricalDegradedRecoveryFiles;
    preflightAt: Date;
  }>): Promise<"empty" | "replay">;
}

export const executeHistoricalDegradedRecovery = async (params: Readonly<{
  authorityBytes: Buffer;
  authoritySha256: string;
  files: HistoricalDegradedRecoveryFiles;
  preflightAt: Date;
  liveVerifier: HistoricalDegradedRecoveryLiveVerifier;
  finalization: ReaderSummaryRecoveryFinalizationPort;
}>): Promise<Readonly<{
  outcome: "published" | "replayed";
  attemptIdentity: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
}>> => {
  const authority = verifyHistoricalDegradedRecoveryAuthorityBytes({
    bytes: params.authorityBytes,
    expectedSha256: params.authoritySha256,
  });
  assertFiles(authority, params.files);
  const live = await params.liveVerifier.verify({
    authority,
    authoritySha256: params.authoritySha256,
    files: params.files,
  });
  const built = buildHistoricalDegradedRecoveryCommand({
    authority,
    authoritySha256: params.authoritySha256,
    live,
  });
  await params.liveVerifier.verifyPublicationSlot({
    authority,
    authoritySha256: params.authoritySha256,
    command: built.command,
    files: params.files,
    preflightAt: params.preflightAt,
  });
  const outcome = await params.finalization.finalize(built.command);
  return Object.freeze({
    outcome,
    attemptIdentity: authority.attempt.identity,
    readerSummaryJobId: built.identities.jobId,
    readerSummaryArtifactId: built.identities.artifactId,
  });
};

export const buildHistoricalDegradedRecoveryCommand = (params: Readonly<{
  authority: HistoricalDegradedRecoveryAuthority;
  authoritySha256: string;
  live: HistoricalDegradedRecoveryLiveVerification;
}>): Readonly<{
  command: ReaderSummaryRecoveryFinalizationCommand;
  identities: ReturnType<typeof recoveryIdentities>;
  runningJob: ReaderSummaryJob;
}> => {
  const { authority, live } = params;
  const source = live.sourceArtifact.toSnapshot();
  assertSourceBinding(authority, source);
  if (!readerSummaryHasNoGitHubEvidence(live.sourceArtifact)) {
    throw new Error(
      "Historical degraded recovery source contains GitHub evidence",
    );
  }
  const identities = recoveryIdentities(authority.attempt.identity);
  const artifact = ReaderSummaryArtifact.create({
    ...source,
    readerSummaryId: identities.artifactId,
    generatedAt: new Date(authority.authorizedAt),
    qualityFlags: ["limited_sources"],
    ...(source.content === undefined
      ? {}
      : {
          content: {
            ...source.content,
            qualityState: {
              ...source.content.qualityState,
              status: "limited_sources" as const,
              flags: ["limited_sources"] as const,
              warnings: [
                ...source.content.qualityState.warnings,
                "GitHub historical projection unavailable for this UTC day.",
              ],
            },
          },
        }),
  });
  const authorizedAt = new Date(authority.authorizedAt);
  const requestedAt = new Date(`${authority.requestedUtcDate}T00:00:00.000Z`);
  const runningJob = ReaderSummaryJob.request({
    id: identities.jobId,
    tenantId: source.tenantId,
    workspaceId: source.workspaceId,
    scope: source.scope,
    period: source.period,
    ...(source.userId === undefined ? {} : { userId: source.userId }),
    ...(source.subscriptionId === undefined
      ? {}
      : { subscriptionId: source.subscriptionId }),
    idempotencyKey:
      `reader-summary:historical-degraded-recovery:${authority.attempt.identity}`,
    requestedAt,
  }).start({ startedAt: authorizedAt });
  const finalJob = runningJob.complete({
    completedAt: authorizedAt,
    readerSummaryId: identities.artifactId,
  });
  const githubEvaluation = historicalOmissionReaderSummaryGitHubProjectionAudit({
    artifact,
    reason: authority.safeReason,
    authorizedAt,
    observedThrough: new Date(authority.githubZero.observedThrough),
  });
  if (githubEvaluation.findings.length !== 0) {
    throw new Error("Verified recovery authority could not construct HistoricalGitHubOmission");
  }
  const publicationDecision = publishedDecision(
    live.sourcePublicationDecision,
    authority.safeReason,
  );
  const readyEvent = recoveryReadyEvent({
    authority,
    artifact,
    jobId: identities.jobId,
    eventId: identities.eventId,
  });
  const command: ReaderSummaryRecoveryFinalizationCommand = {
    publication: {
      artifact,
      finalJob,
      publicationDecision,
      githubProjectionAudit: githubEvaluation.audit,
      readyEvent,
    },
    provenance: recoveryProvenance(authority, params.authoritySha256),
    candidate: { runningJob },
  };
  return Object.freeze({ command, identities, runningJob });
};

const recoveryProvenance = (
  authority: HistoricalDegradedRecoveryAuthority,
  authoritySha256: string,
): ReaderSummaryRecoveryFinalizationCommand["provenance"] => ({
  schemaVersion: "reader_summary.summary_only_recovery_provenance.v1",
  mode: "summary-only",
  collectionUtcPeriod: {
    startedAt: authority.period.startedAt,
    endedAt: authority.period.endedAt,
    timezone: authority.period.timezone,
  },
  priorCollectionProof: {
    sourceAttempt: {
      artifactFormat: historicalDegradedRecoveryAuthorityFormat,
      sha256: authoritySha256,
    },
    collectionArtifact: {
      artifactFormat: "reader-summary-clean-real-day-collection-v1",
      sha256: authority.inputs.collectionArtifactSha256,
    },
    collectionQualityReport: {
      artifactFormat: "yesterday-social-collection-quality-report-v1",
      sha256: authority.inputs.collectionQualityReportSha256,
    },
  },
  regenerationInputManifest: {
    artifactFormat: "reader-summary-day-dataset-manifest-v1",
    sha256: authority.inputs.datasetManifestSha256,
    datasetSha256: authority.dataset.aggregateSha256,
  },
});

const publishedDecision = (
  source: Extract<ReaderSummaryPublicationDecision, { readonly status: "rejected" }>,
  boundedReason: string,
): Extract<ReaderSummaryPublicationDecision, { readonly status: "published" }> => ({
  status: "published",
  qualityPassed: true,
  canonicalScore: source.canonicalScore,
  shadow: source.shadow,
  reasons: [boundedReason],
});

const recoveryReadyEvent = (params: {
  readonly authority: HistoricalDegradedRecoveryAuthority;
  readonly artifact: ReaderSummaryArtifact;
  readonly jobId: string;
  readonly eventId: string;
}): ReaderSummaryReadyEvent => {
  const snapshot = params.artifact.toSnapshot();
  return {
    eventId: eventId(params.eventId),
    eventType: "reader_summary.ready",
    schemaVersion: 1,
    occurredAt: new Date(params.authority.authorizedAt),
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    correlationId: correlationId(params.jobId),
    causationId: causationId(params.jobId),
    payload: {
      readerSummaryJobId: params.jobId,
      readerSummaryId: snapshot.readerSummaryId,
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      period: snapshot.period,
      ...(snapshot.userId === undefined ? {} : { userId: snapshot.userId }),
      ...(snapshot.subscriptionId === undefined
        ? {}
        : { subscriptionId: snapshot.subscriptionId }),
      status: "completed",
    },
  };
};

const assertFiles = (
  authority: HistoricalDegradedRecoveryAuthority,
  files: HistoricalDegradedRecoveryFiles,
): void => {
  if (
    sha256(files.collectionArtifactBytes) !== authority.inputs.collectionArtifactSha256 ||
    sha256(files.collectionQualityReportBytes) !== authority.inputs.collectionQualityReportSha256 ||
    sha256(files.datasetManifestBytes) !== authority.inputs.datasetManifestSha256
  ) {
    throw new Error("Historical degraded recovery input file mutation detected");
  }
};

const assertSourceBinding = (
  authority: HistoricalDegradedRecoveryAuthority,
  source: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): void => {
  if (
    source.readerSummaryId !== authority.source.artifactId ||
    source.tenantId !== authority.tenantId ||
    source.workspaceId !== authority.workspaceId ||
    source.scope.type !== "workspace" ||
    source.period.cadence !== "daily" ||
    source.period.startedAt.toISOString() !== authority.period.startedAt ||
    source.period.endedAt.toISOString() !== authority.period.endedAt ||
    source.period.timezone !== "UTC" ||
    source.qualityFlags.length !== 0 ||
    source.executiveSummary.trim().length === 0
  ) {
    throw new Error("Historical degraded recovery source artifact changed");
  }
};

export const recoveryIdentities = (identity: string): Readonly<{
  jobId: string;
  artifactId: string;
  eventId: string;
}> => ({
  jobId: uuidFromHash(identity, "job"),
  artifactId: uuidFromHash(identity, "artifact"),
  eventId: uuidFromHash(identity, "ready-event"),
});

const uuidFromHash = (identity: string, kind: string): string => {
  const hex = createHash("sha256").update(`${kind}\u0000${identity}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
