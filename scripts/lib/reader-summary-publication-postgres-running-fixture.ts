import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";
import {
  canonicalObject,
  createReaderSummaryPublicationFixtureAuthority,
  sha256,
  stableJson,
  type EvidenceFixtureOverrides,
  type ReaderSummaryPublicationEvidenceFixture,
} from "./reader-summary-weekly-publication-evidence-postgres-contract";

export type ReaderSummaryPublicationRunningFixture =
  ReaderSummaryPublicationEvidenceFixture;

export const createReaderSummaryPublicationRunningFixture = async (
  client: PoolClient,
  status: "COMPLETED" | "NO_SIGNAL",
  day: number | string,
  overrides: {
    readonly requestedAt?: string;
    readonly modelVersion?: string;
  } & EvidenceFixtureOverrides = {},
): Promise<ReaderSummaryPublicationRunningFixture> => {
  const { tenantId, workspaceId } = readerSummaryPublicationFixtureScope;
  const jobId = randomUUID();
  const artifactId = randomUUID();
  const eventId = randomUUID();
  const requestedAt =
    overrides.requestedAt ?? readerSummaryPublicationUtc(day, 10);
  const modelVersion = overrides.modelVersion ?? "codex:gpt-5.5:xhigh";
  const startedAt = readerSummaryPublicationPeriodStart(day);
  const endedAt = readerSummaryPublicationPeriodEnd(day);
  const periodKey = `daily:${startedAt}:${endedAt}:UTC`;
  const interestId = overrides.publicationInterestId;
  const scopeType = interestId === undefined ? "workspace" : "interest";
  const scopeKey =
    interestId === undefined ? "workspace" : `interest:${interestId}`;
  if (interestId !== undefined) {
    await client.query(
      `INSERT INTO interests (
         id, tenant_id, workspace_id, name, query, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'publication evidence', 'ENABLED', $5, $5)`,
      [
        interestId,
        tenantId,
        workspaceId,
        `Publication ${interestId}`,
        requestedAt,
      ],
    );
  }
  await client.query(
    `INSERT INTO reader_summary_jobs (
       id, tenant_id, workspace_id, scope_type, scope_key, interest_id, cadence,
       period_started_at, period_ended_at, period_timezone, period_key,
       status, idempotency_key, requested_at, started_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, 'daily', $7, $8, 'UTC', $9,
       'RUNNING', $10, $11, $11, $11, $11
     )`,
    [
      jobId,
      tenantId,
      workspaceId,
      scopeType,
      scopeKey,
      interestId ?? null,
      startedAt,
      endedAt,
      periodKey,
      `publication-gate:${jobId}`,
      requestedAt,
    ],
  );
  const qualityFlags = status === "NO_SIGNAL" ? ["no_signal"] : [];
  const promptVersion = "reader-summary.prompt.pg-gate.v1";
  const scope =
    interestId === undefined
      ? ({ type: "workspace" } as const)
      : ({ type: "interest", interestId } as const);
  const period = {
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
    periodKey,
  } as const;
  const lineage = {
    schemaVersion: "reader_summary.artifact.v1",
    modelVersion,
    providerVersion: "reader-summary.provider.pg-gate.v1",
    promptVersion,
    rulesVersion: "reader-summary.rules.pg-gate.v1",
    evalDatasetVersion: "reader-summary.eval.pg-gate.v1",
  } as const;
  const evidenceAuthority =
    await createReaderSummaryPublicationFixtureAuthority({
      client,
      tenantId,
      workspaceId,
      status,
      startedAt,
      endedAt,
      requestedAt,
      overrides,
    });
  const citations = evidenceAuthority.citations;
  const githubProjectionAudit = evidenceAuthority.githubProjectionAudit;
  const persistedQualitySignals = {
    qualityFlags,
    publicationDecision: { status: "published", qualityPassed: true },
    githubProjectionAudit,
  };
  const report = canonicalObject({
    schemaVersion: "reader_summary.publication_report.v1",
    semanticStatus: status,
    modelVersion,
    promptVersion,
    headline: status === "NO_SIGNAL" ? "No reliable signal" : "Proved report",
    summaryText:
      status === "NO_SIGNAL" ? "No eligible evidence." : "Exact report body.",
    artifactPayload: {
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: artifactId,
      tenantId,
      workspaceId,
      scope,
      period,
      headline:
        status === "NO_SIGNAL" ? "No reliable signal" : "Proved report",
      executiveSummary:
        status === "NO_SIGNAL" ? "No eligible evidence." : "Exact report body.",
      lineage,
      citationMap: citations,
      qualityFlags,
      content: evidenceAuthority.content,
      ...(status === "NO_SIGNAL"
        ? { noSignalReason: "No eligible evidence." }
        : {}),
    },
    citations,
    qualitySignals: {
      ...persistedQualitySignals,
      publicationGeneration: { requestedAt },
    },
  });
  const reportCanonical = stableJson(report);
  const reportSha256 = sha256(reportCanonical);
  const exactProof = canonicalObject({
    schemaVersion: "reader_summary.publication_proof.v1",
    tenantId,
    workspaceId,
    scope: { type: scopeType, key: scopeKey },
    period: {
      cadence: "daily",
      startedAt,
      endedAt,
      timezone: "UTC",
      periodKey,
    },
    requestedUtcDate: requestedAt.slice(0, 10),
    requestedAt,
    readerSummaryJobId: jobId,
    readerSummaryArtifactId: artifactId,
    semanticStatus: status,
    modelVersion,
    reportSha256,
  });
  const proofCanonical = stableJson(exactProof);
  const payload = canonicalObject({
    schemaVersion: "reader_summary.publication.v1",
    tenantId,
    workspaceId,
    scopeType,
    scopeKey,
    ...(interestId === undefined ? {} : { interestId }),
    cadence: "daily",
    periodStartedAt: startedAt,
    periodEndedAt: endedAt,
    periodTimezone: "UTC",
    periodKey,
    requestedUtcDate: requestedAt.slice(0, 10),
    requestedAt,
    readerSummaryJobId: jobId,
    readerSummaryArtifactId: artifactId,
    semanticStatus: status,
    modelVersion,
    publishedAt: readerSummaryPublicationUtc(day, 11),
    report,
    reportCanonical,
    reportSha256,
    exactProof,
    proofCanonical,
    proofSha256: sha256(proofCanonical),
    readyEvent: {
      eventId,
      eventType: "reader_summary.ready",
      schemaVersion: 1,
      occurredAt: readerSummaryPublicationUtc(day, 11),
      tenantId,
      workspaceId,
      correlationId: jobId,
      causationId: jobId,
      payload: {
        readerSummaryJobId: jobId,
        readerSummaryId: artifactId,
        tenantId,
        workspaceId,
        scope,
        period,
        status: status === "NO_SIGNAL" ? "no_signal" : "completed",
      },
    },
  });
  await client.query(
    `INSERT INTO reader_summary_artifacts (
       id, tenant_id, workspace_id, scope_type, scope_key, interest_id, cadence,
       period_started_at, period_ended_at, period_timezone, period_key,
       status, schema_version, model_version, prompt_version, headline,
       summary_text, artifact_payload, citations, quality_signals,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, 'daily', $7, $8, 'UTC', $9,
       'RUNNING', 1, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
       $17, $17
     )`,
    [
      artifactId,
      tenantId,
      workspaceId,
      scopeType,
      scopeKey,
      interestId ?? null,
      startedAt,
      endedAt,
      periodKey,
      modelVersion,
      promptVersion,
      report.headline,
      report.summaryText,
      JSON.stringify(report.artifactPayload),
      JSON.stringify(report.citations),
      JSON.stringify(persistedQualitySignals),
      requestedAt,
    ],
  );
  return {
    jobId,
    artifactId,
    eventId,
    payload,
    ...(evidenceAuthority.githubSourceBindingId === undefined
      ? {}
      : { githubSourceBindingId: evidenceAuthority.githubSourceBindingId }),
  };
};

export const readerSummaryPublicationPeriodStart = (
  day: number | string,
): string => readerSummaryPublicationUtc(day, 0);

export const readerSummaryPublicationPeriodEnd = (
  day: number | string,
): string =>
  new Date(
    Date.parse(readerSummaryPublicationPeriodStart(day)) + 86_400_000,
  ).toISOString();

export const readerSummaryPublicationUtc = (
  day: number | string,
  hour: number,
): string => {
  const date =
    typeof day === "number"
      ? new Date(Date.UTC(2026, 5, day)).toISOString().slice(0, 10)
      : day;
  return new Date(
    Date.parse(`${date}T00:00:00.000Z`) + hour * 3_600_000,
  ).toISOString();
};
