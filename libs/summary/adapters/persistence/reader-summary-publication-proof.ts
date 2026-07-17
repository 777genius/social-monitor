import { createHash } from "node:crypto";

import { readerSummaryScopeKey } from "../../domain";
import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationOutcome,
} from "../../ports";

export type ReaderSummaryPublicationPayload = Readonly<{
  schemaVersion: "reader_summary.publication.v1";
  tenantId: string;
  workspaceId: string;
  scopeType: string;
  scopeKey: string;
  interestId?: string;
  cadence: string;
  periodStartedAt: string;
  periodEndedAt: string;
  periodTimezone: string;
  periodKey: string;
  requestedUtcDate: string;
  requestedAt: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  modelVersion: string;
  userId?: string;
  subscriptionId?: string;
  publishedAt: string;
  report: Readonly<Record<string, unknown>>;
  reportCanonical: string;
  reportSha256: string;
  exactProof: Readonly<Record<string, unknown>>;
  proofCanonical: string;
  proofSha256: string;
  readyEvent: Readonly<Record<string, unknown>>;
}>;

export type ReaderSummaryPublicationSqlRow = Readonly<{
  outcome: ReaderSummaryPublicationOutcome;
  publication_id: string;
  report_sha256: string;
  proof_sha256: string;
}>;

export const buildReaderSummaryPublicationPayload = (
  command: ReaderSummaryPublicationCommand,
): ReaderSummaryPublicationPayload => {
  const artifact = command.artifact.toSnapshot();
  const job = command.finalJob.toSnapshot();
  const semanticStatus = publicationStatus(job.status);
  const scopeKey = readerSummaryScopeKey(artifact.scope);
  const requestedAt = validDate(job.requestedAt, "requestedAt");
  const publishedAt = validDate(job.completedAt, "completedAt");

  assertExactPublicationBinding({
    artifact,
    job,
    scopeKey,
    semanticStatus,
  });

  const qualitySignals = publicationJsonObject({
    qualityFlags: artifact.qualityFlags,
    confidence: artifact.confidence,
    usage: artifact.usage,
    publicationDecision: command.publicationDecision,
    publicationGeneration: { requestedAt },
  });
  const report = publicationJsonObject({
    schemaVersion: "reader_summary.publication_report.v1",
    semanticStatus,
    modelVersion: artifact.lineage.modelVersion,
    promptVersion: artifact.lineage.promptVersion,
    headline: artifact.headline,
    summaryText: artifact.executiveSummary,
    artifactPayload: artifact,
    citations: artifact.citationMap,
    qualitySignals,
  });
  const reportCanonical = stablePublicationJson(report);
  const reportSha256 = sha256(reportCanonical);
  const requestedUtcDate = requestedAt.slice(0, 10);
  const exactProof = publicationJsonObject({
    schemaVersion: "reader_summary.publication_proof.v1",
    tenantId: artifact.tenantId,
    workspaceId: artifact.workspaceId,
    scope: { type: artifact.scope.type, key: scopeKey },
    period: {
      cadence: artifact.period.cadence,
      startedAt: artifact.period.startedAt,
      endedAt: artifact.period.endedAt,
      timezone: artifact.period.timezone,
      periodKey: artifact.period.periodKey,
    },
    requestedUtcDate,
    requestedAt,
    readerSummaryJobId: job.id,
    readerSummaryArtifactId: artifact.readerSummaryId,
    semanticStatus,
    modelVersion: artifact.lineage.modelVersion,
    reportSha256,
  });
  const proofCanonical = stablePublicationJson(exactProof);
  const readyEvent = publicationJsonObject(command.readyEvent);
  assertReadyEventBinding({
    readyEvent,
    artifact,
    job,
    semanticStatus,
  });

  return {
    schemaVersion: "reader_summary.publication.v1",
    tenantId: artifact.tenantId,
    workspaceId: artifact.workspaceId,
    scopeType: artifact.scope.type,
    scopeKey,
    ...(artifact.scope.type === "interest"
      ? { interestId: artifact.scope.interestId }
      : {}),
    cadence: artifact.period.cadence,
    periodStartedAt: artifact.period.startedAt.toISOString(),
    periodEndedAt: artifact.period.endedAt.toISOString(),
    periodTimezone: artifact.period.timezone,
    periodKey: artifact.period.periodKey,
    requestedUtcDate,
    requestedAt,
    readerSummaryJobId: job.id,
    readerSummaryArtifactId: artifact.readerSummaryId,
    semanticStatus,
    modelVersion: artifact.lineage.modelVersion,
    ...(artifact.userId === undefined ? {} : { userId: artifact.userId }),
    ...(artifact.subscriptionId === undefined
      ? {}
      : { subscriptionId: artifact.subscriptionId }),
    publishedAt,
    report,
    reportCanonical,
    reportSha256,
    exactProof,
    proofCanonical,
    proofSha256: sha256(proofCanonical),
    readyEvent,
  };
};

export const stablePublicationJson = (value: unknown): string =>
  JSON.stringify(publicationJsonValue(value, "publication"));

const assertExactPublicationBinding = (params: {
  readonly artifact: ReturnType<
    ReaderSummaryPublicationCommand["artifact"]["toSnapshot"]
  >;
  readonly job: ReturnType<
    ReaderSummaryPublicationCommand["finalJob"]["toSnapshot"]
  >;
  readonly scopeKey: string;
  readonly semanticStatus: "COMPLETED" | "NO_SIGNAL";
}): void => {
  const { artifact, job } = params;
  if (
    commandScopeKey(job.scope) !== params.scopeKey ||
    artifact.tenantId !== job.tenantId ||
    artifact.workspaceId !== job.workspaceId ||
    artifact.readerSummaryId !== job.readerSummaryId ||
    artifact.userId !== job.userId ||
    artifact.subscriptionId !== job.subscriptionId ||
    artifact.period.cadence !== job.period.cadence ||
    artifact.period.startedAt.getTime() !== job.period.startedAt.getTime() ||
    artifact.period.endedAt.getTime() !== job.period.endedAt.getTime() ||
    artifact.period.timezone !== job.period.timezone ||
    artifact.period.periodKey !== job.period.periodKey
  ) {
    throw new Error(
      "Reader summary artifact and final job do not have an exact publication binding",
    );
  }

  const artifactIsNoSignal = artifact.qualityFlags.includes("no_signal");
  if (
    (params.semanticStatus === "NO_SIGNAL") !== artifactIsNoSignal ||
    job.status === "quality_rejected" ||
    job.status === "failed"
  ) {
    throw new Error(
      "Reader summary artifact and final job semantic statuses do not match",
    );
  }
};

const commandScopeKey = (
  scope: ReaderSummaryPublicationCommand["finalJob"] extends never
    ? never
    : ReturnType<
        ReaderSummaryPublicationCommand["finalJob"]["toSnapshot"]
      >["scope"],
): string => readerSummaryScopeKey(scope);

const assertReadyEventBinding = (params: {
  readonly readyEvent: Readonly<Record<string, unknown>>;
  readonly artifact: ReturnType<
    ReaderSummaryPublicationCommand["artifact"]["toSnapshot"]
  >;
  readonly job: ReturnType<
    ReaderSummaryPublicationCommand["finalJob"]["toSnapshot"]
  >;
  readonly semanticStatus: "COMPLETED" | "NO_SIGNAL";
}): void => {
  const event = params.readyEvent;
  const payload = publicationJsonObject(event.payload);
  const expectedStatus =
    params.semanticStatus === "NO_SIGNAL" ? "no_signal" : "completed";
  if (
    typeof event.eventId !== "string" ||
    event.eventId.trim().length === 0 ||
    event.eventType !== "reader_summary.ready" ||
    event.schemaVersion !== 1 ||
    event.occurredAt !== validDate(params.job.completedAt, "completedAt") ||
    event.tenantId !== params.artifact.tenantId ||
    event.workspaceId !== params.artifact.workspaceId ||
    event.correlationId !== params.job.id ||
    event.causationId !== params.job.id ||
    payload.readerSummaryJobId !== params.job.id ||
    payload.readerSummaryId !== params.artifact.readerSummaryId ||
    payload.tenantId !== params.artifact.tenantId ||
    payload.workspaceId !== params.artifact.workspaceId ||
    payload.userId !== params.artifact.userId ||
    payload.subscriptionId !== params.artifact.subscriptionId ||
    payload.status !== expectedStatus ||
    stablePublicationJson(payload.scope) !==
      stablePublicationJson(params.artifact.scope) ||
    stablePublicationJson(payload.period) !==
      stablePublicationJson(params.artifact.period)
  ) {
    throw new Error(
      "Reader summary ready event does not have an exact publication binding",
    );
  }
};

const publicationStatus = (
  status: ReturnType<
    ReaderSummaryPublicationCommand["finalJob"]["toSnapshot"]
  >["status"],
): "COMPLETED" | "NO_SIGNAL" => {
  if (status === "completed") {
    return "COMPLETED";
  }
  if (status === "no_signal") {
    return "NO_SIGNAL";
  }

  throw new Error("Reader summary publication requires a final semantic job");
};

const validDate = (value: Date | undefined, name: string): string => {
  if (value === undefined || Number.isNaN(value.getTime())) {
    throw new Error(`Reader summary publication ${name} must be present`);
  }

  return value.toISOString();
};

const publicationJsonObject = (
  value: unknown,
): Readonly<Record<string, unknown>> => {
  const normalized = publicationJsonValue(value, "publication");
  if (
    normalized === null ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    throw new Error("Reader summary publication value must be a JSON object");
  }

  return normalized as Readonly<Record<string, unknown>>;
};

type PublicationJson =
  | string
  | number
  | boolean
  | null
  | readonly PublicationJson[]
  | { readonly [key: string]: PublicationJson };

const publicationJsonValue = (
  value: unknown,
  path: string,
): PublicationJson => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must not contain non-finite numbers`);
    }
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${path} must not contain invalid dates`);
    }
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      publicationJsonValue(item, `${path}[${index}]`),
    );
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, PublicationJson> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        result[key] = publicationJsonValue(child, `${path}.${key}`);
      }
    }
    return result;
  }

  throw new Error(`${path} contains a non-JSON value`);
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
