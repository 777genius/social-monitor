import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import type {
  ReaderSummaryWeeklyArtifactSnapshot,
} from "../../../domain/entities/reader-summary-weekly-artifact";
import {
  assertReaderSummaryWeeklyPublicationProof,
  type ReaderSummaryWeeklyPublicationProof,
} from "../../../domain/policies/reader-summary-weekly-publication-authorization";
import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  assertReaderSummaryWeeklyPlainObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import type {
  FindReaderSummaryWeeklyArtifactQuery,
  PersistedReaderSummaryWeeklyArtifact,
  SaveReaderSummaryWeeklyArtifactCommand,
} from "../../../ports";
import {
  buildReaderSummaryWeeklyPublicationPersistencePayload,
  type ReaderSummaryWeeklyPublicationPersistenceSqlRow,
} from "../reader-summary-weekly-publication-payload";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import { runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";

export type PrismaReaderSummaryWeeklyPublicationRecord = Readonly<{
  artifact_id: string; tenant_id: string; workspace_id: string;
  scope_type: string; scope_key: string; interest_id: string | null;
  cadence: string; period_started_at: Date; period_ended_at: Date;
  period_timezone: string; period_key: string; user_id: string | null;
  subscription_id: string | null; artifact_status: string;
  schema_version: number; model_version: string; prompt_version: string;
  headline: string; summary_text: string | null; artifact_payload: unknown;
  citations: unknown; quality_signals: unknown;
  publication_id: string | null; publication_tenant_id: string | null;
  publication_workspace_id: string | null; publication_scope_type: string | null;
  publication_scope_key: string | null; publication_cadence: string | null;
  publication_period_started_at: Date | null;
  publication_period_ended_at: Date | null;
  publication_period_timezone: string | null;
  publication_period_key: string | null;
  publication_requested_utc_date: string | null;
  publication_kind: string | null; publication_job_id: string | null;
  publication_artifact_id: string | null; publication_status: string | null;
  publication_model_version: string | null;
  publication_model_authority: number | null;
  publication_report_sha256: string | null;
  publication_proof_sha256: string | null;
  publication_exact_proof: unknown;
  publication_outbox_event_id: string | null;
  publication_timestamps_match: boolean | null;
  publication_artifact_timestamp_match: boolean | null;
  slot_tenant_id: string | null; slot_workspace_id: string | null;
  slot_scope_type: string | null; slot_scope_key: string | null;
  slot_cadence: string | null; slot_period_started_at: Date | null;
  slot_period_ended_at: Date | null; slot_period_timezone: string | null;
  slot_current_publication_id: string | null;
  slot_publication_timestamp_match: boolean | null;
}>;

const artifactPayloadKeys = [
  "schemaVersion", "output", "publicationProof",
] as const;
const qualitySignalKeys = [
  "kind", "editorialQuality", "weeklyPublicationProof",
] as const;
const outputKeys = [
  "schemaVersion", "sealId", "sealSha", "weekStartedOn", "weekEndedOn",
  "headline", "headlineCitationIds", "takeaway", "takeawayCitationIds",
  "synthesis", "synthesisCitationIds", "stories", "sections",
] as const;
const editorialQualityKeys = [
  "policyVersion", "publicationDecision", "metrics", "qualityGates", "issues",
  "blockingPassed",
] as const;
const authorityKeys = [
  "requestedUtcDate", "publicationId", "publicationEvidenceIdentity",
  "publicationEvidenceSha256", "storyAuthorityIdentity", "storyAuthoritySha256",
  "githubBoardIdentity", "githubBoardSha256",
] as const;
const citationKeys = [
  "citationId", "requestedUtcDate", "publicationId",
  "publicationEvidenceIdentity", "providerKey", "feedItemId", "sourceItemId",
  "sourceBindingId", "providerItemId", "canonicalUrl", "sourceContentHash",
] as const;

export const saveReaderSummaryWeeklyArtifact = async (
  client: PrismaSummaryClient,
  command: SaveReaderSummaryWeeklyArtifactCommand,
): Promise<void> => {
  const payload = buildReaderSummaryWeeklyPublicationPersistencePayload(command);
  const serialized = JSON.stringify(payload);
  const rows = await withPrismaWriteRetry(() =>
    runSerializableReaderSummaryTransaction(client, (prisma) =>
      prisma.$queryRaw<
        readonly ReaderSummaryWeeklyPublicationPersistenceSqlRow[]
      >`
        SELECT *
        FROM "persist_reader_summary_weekly_artifact"(${serialized}::jsonb)
      `,
    ),
  );
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error("PostgreSQL weekly persistence returned no exact outcome");
  }
  if (
    (row.outcome !== "persisted" && row.outcome !== "replayed") ||
    row.artifact_id !== payload.artifactId ||
    row.artifact_payload_sha256 !== payload.artifactPayloadSha256 ||
    row.proof_sha256 !== payload.proof.sha256
  ) {
    throw new Error("PostgreSQL weekly persistence returned a mismatched proof");
  }
};

export const findReaderSummaryWeeklyArtifactById = async (
  prisma: PrismaSummaryClient,
  query: FindReaderSummaryWeeklyArtifactQuery,
): Promise<PersistedReaderSummaryWeeklyArtifact | null> => {
  const rows = await prisma.$queryRaw<
    readonly PrismaReaderSummaryWeeklyPublicationRecord[]
  >`
    SELECT
      artifact."id"::TEXT AS artifact_id,
      artifact."tenant_id"::TEXT AS tenant_id,
      artifact."workspace_id"::TEXT AS workspace_id,
      artifact."scope_type", artifact."scope_key",
      artifact."interest_id"::TEXT AS interest_id,
      artifact."cadence",
      artifact."period_started_at", artifact."period_ended_at",
      artifact."period_timezone", artifact."period_key",
      artifact."user_id", artifact."subscription_id"::TEXT AS subscription_id,
      artifact."status"::TEXT AS artifact_status,
      artifact."schema_version", artifact."model_version",
      artifact."prompt_version", artifact."headline",
      artifact."summary_text", artifact."artifact_payload",
      artifact."citations", artifact."quality_signals",
      publication."id"::TEXT AS publication_id,
      publication."tenant_id"::TEXT AS publication_tenant_id,
      publication."workspace_id"::TEXT AS publication_workspace_id,
      publication."scope_type" AS publication_scope_type,
      publication."scope_key" AS publication_scope_key,
      publication."cadence" AS publication_cadence,
      publication."period_started_at" AS publication_period_started_at,
      publication."period_ended_at" AS publication_period_ended_at,
      publication."period_timezone" AS publication_period_timezone,
      publication."period_key" AS publication_period_key,
      to_char(publication."requested_utc_date", 'YYYY-MM-DD')
        AS publication_requested_utc_date,
      publication."publication_kind", publication."reader_summary_job_id"::TEXT
        AS publication_job_id,
      publication."reader_summary_artifact_id"::TEXT
        AS publication_artifact_id,
      publication."semantic_status"::TEXT AS publication_status,
      publication."model_version" AS publication_model_version,
      publication."model_authority" AS publication_model_authority,
      btrim(publication."report_sha256") AS publication_report_sha256,
      btrim(publication."proof_sha256") AS publication_proof_sha256,
      publication."exact_proof" AS publication_exact_proof,
      publication."outbox_event_id"::TEXT AS publication_outbox_event_id,
      publication."requested_at" = publication."published_at"
        AS publication_timestamps_match,
      publication."published_at" = artifact."updated_at"
        AS publication_artifact_timestamp_match,
      slot."tenant_id"::TEXT AS slot_tenant_id,
      slot."workspace_id"::TEXT AS slot_workspace_id,
      slot."scope_type" AS slot_scope_type,
      slot."scope_key" AS slot_scope_key,
      slot."cadence" AS slot_cadence,
      slot."period_started_at" AS slot_period_started_at,
      slot."period_ended_at" AS slot_period_ended_at,
      slot."period_timezone" AS slot_period_timezone,
      slot."current_publication_id"::TEXT AS slot_current_publication_id,
      slot."updated_at" = publication."published_at"
        AS slot_publication_timestamp_match
    FROM "reader_summary_artifacts" AS artifact
    LEFT JOIN "reader_summary_publications" AS publication
      ON publication."reader_summary_artifact_id" = artifact."id"
    LEFT JOIN "reader_summary_publication_slots" AS slot
      ON slot."tenant_id" = artifact."tenant_id"
      AND slot."workspace_id" = artifact."workspace_id"
      AND slot."scope_type" = artifact."scope_type"
      AND slot."scope_key" = artifact."scope_key"
      AND slot."cadence" = artifact."cadence"
      AND slot."period_started_at" = artifact."period_started_at"
      AND slot."period_ended_at" = artifact."period_ended_at"
      AND slot."period_timezone" = artifact."period_timezone"
    WHERE artifact."tenant_id" = ${query.tenantId}::UUID
      AND artifact."workspace_id" = ${query.workspaceId}::UUID
      AND artifact."id" = ${query.artifactId}::UUID
  `;
  if (rows.length === 0) {
    return null;
  }
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error("Reader summary weekly publication state is ambiguous");
  }
  return readerSummaryWeeklyFromPrisma(rows[0], query);
};

export const readerSummaryWeeklyFromPrisma = (
  row: PrismaReaderSummaryWeeklyPublicationRecord,
  query: FindReaderSummaryWeeklyArtifactQuery,
): PersistedReaderSummaryWeeklyArtifact => {
  assertReaderSummaryWeeklyExactObject(
    row.artifact_payload,
    artifactPayloadKeys,
    "persisted artifact payload",
    { allowAuthoritativeHashes: true },
  );
  assertReaderSummaryWeeklyExactObject(
    row.quality_signals,
    qualitySignalKeys,
    "persisted quality signals",
    { allowAuthoritativeHashes: true },
  );
  const payload = row.artifact_payload;
  const quality = row.quality_signals;
  assertReaderSummaryWeeklyExactObject(
    payload.output,
    outputKeys,
    "persisted model output",
    { allowAuthoritativeHashes: true },
  );
  assertReaderSummaryWeeklyExactObject(
    quality.editorialQuality,
    editorialQualityKeys,
    "persisted editorial quality",
  );
  assertReaderSummaryWeeklyDenseArray(
    payload.output.headlineCitationIds,
    "persisted headline citations",
  );
  assertReaderSummaryWeeklyDenseArray(
    payload.output.takeawayCitationIds,
    "persisted takeaway citations",
  );
  assertReaderSummaryWeeklyDenseArray(
    payload.output.synthesisCitationIds,
    "persisted synthesis citations",
  );
  assertReaderSummaryWeeklyDenseArray(
    payload.output.stories,
    "persisted output stories",
  );
  assertReaderSummaryWeeklyDenseArray(
    payload.output.sections,
    "persisted output sections",
  );
  assertReaderSummaryWeeklyPlainObject(
    quality.editorialQuality.metrics,
    "persisted editorial metrics",
  );
  assertReaderSummaryWeeklyPlainObject(
    quality.editorialQuality.qualityGates,
    "persisted editorial gates",
  );
  assertReaderSummaryWeeklyDenseArray(
    quality.editorialQuality.issues,
    "persisted editorial issues",
  );
  assertReaderSummaryWeeklyPublicationProof(payload.publicationProof);
  assertReaderSummaryWeeklyPublicationProof(quality.weeklyPublicationProof);
  assertReaderSummaryWeeklyPublicationProof(row.publication_exact_proof);
  const proof = payload.publicationProof;
  assertProofEvidence(proof);

  const periodStartedAt = `${proof.weekStartedOn}T00:00:00.000Z`;
  const periodEndedAt = nextUtcDay(proof.weekEndedOn);
  const expectedScope = proof.scope.type === "workspace"
    ? { type: "workspace" as const, key: "workspace", interestId: null }
    : {
        type: "interest" as const,
        key: `interest:${proof.scope.interestId}`,
        interestId: proof.scope.interestId,
      };
  const payloadHash = canonicalizeReaderSummaryWeeklyJson(
    payload,
    "persisted artifact payload",
  ).sha256;
  const outputHash = canonicalizeReaderSummaryWeeklyJson(
    payload.output,
    "persisted model output",
  ).sha256;
  const editorialHash = canonicalizeReaderSummaryWeeklyJson(
    quality.editorialQuality,
    "persisted editorial quality",
  ).sha256;
  const proofJson = canonicalizeReaderSummaryWeeklyJson(
    proof,
    "persisted publication proof",
  ).json;

  if (
    row.artifact_id !== query.artifactId ||
    row.artifact_id !== proof.artifactId ||
    row.tenant_id !== query.tenantId || row.tenant_id !== proof.tenantId ||
    row.workspace_id !== query.workspaceId ||
    row.workspace_id !== proof.workspaceId ||
    row.scope_type !== expectedScope.type || row.scope_key !== expectedScope.key ||
    row.interest_id !== expectedScope.interestId || row.cadence !== "weekly" ||
    row.period_started_at.toISOString() !== periodStartedAt ||
    row.period_ended_at.toISOString() !== periodEndedAt ||
    row.period_timezone !== "UTC" ||
    row.period_key !== `weekly:${periodStartedAt}:${periodEndedAt}:UTC` ||
    row.user_id !== null || row.subscription_id !== null ||
    row.artifact_status !== "COMPLETED" || row.schema_version !== 1 ||
    row.model_version !== payload.output.schemaVersion ||
    row.prompt_version !== quality.editorialQuality.policyVersion ||
    row.headline !== payload.output.headline ||
    row.summary_text !== payload.output.synthesis ||
    payload.schemaVersion !== "reader_summary.weekly_persisted_artifact.v1" ||
    payload.output.schemaVersion !== "reader_summary.weekly_model_output.v1" ||
    payload.output.sealId !== proof.modelInputSealId ||
    payload.output.sealSha !== proof.modelInputSealSha256 ||
    payload.output.weekStartedOn !== proof.weekStartedOn ||
    payload.output.weekEndedOn !== proof.weekEndedOn ||
    outputHash !== proof.artifactSha256 || editorialHash !== proof.editorialQualitySha256 ||
    quality.kind !== "weekly" ||
    quality.editorialQuality.policyVersion !==
      "reader_summary.weekly_editorial_quality.v2" ||
    quality.editorialQuality.publicationDecision !== "allow" ||
    quality.editorialQuality.blockingPassed !== true ||
    !sameJson(payload.publicationProof, quality.weeklyPublicationProof) ||
    !sameJson(row.citations, proof.citations) ||
    !publicationMatches(row, proof, expectedScope, payloadHash, proofJson) ||
    !slotMatches(row)
  ) {
    throw new Error("Reader summary weekly publication state is invalid");
  }

  return deepFreezeReaderSummaryWeekly({
    kind: "weekly",
    artifactId: row.artifact_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    artifact: {
      output: payload.output as ReaderSummaryWeeklyArtifactSnapshot["output"],
      editorialQuality:
        quality.editorialQuality as ReaderSummaryWeeklyArtifactSnapshot["editorialQuality"],
    },
    qualitySignals: {
      kind: "weekly",
      editorialQuality:
        quality.editorialQuality as ReaderSummaryWeeklyArtifactSnapshot["editorialQuality"],
    },
    proof,
  });
};

const publicationMatches = (
  row: PrismaReaderSummaryWeeklyPublicationRecord,
  proof: ReaderSummaryWeeklyPublicationProof,
  scope: Readonly<{ type: string; key: string; interestId: string | null }>,
  payloadHash: string,
  proofJson: string,
): boolean =>
  row.publication_id === row.artifact_id &&
  row.publication_tenant_id === row.tenant_id &&
  row.publication_workspace_id === row.workspace_id &&
  row.publication_scope_type === scope.type &&
  row.publication_scope_key === scope.key &&
  row.publication_cadence === "weekly" &&
  row.publication_period_started_at?.getTime() === row.period_started_at.getTime() &&
  row.publication_period_ended_at?.getTime() === row.period_ended_at.getTime() &&
  row.publication_period_timezone === "UTC" &&
  row.publication_period_key === row.period_key &&
  row.publication_requested_utc_date === proof.weekStartedOn &&
  row.publication_kind === "WEEKLY_CERTIFIED" &&
  row.publication_job_id === null &&
  row.publication_artifact_id === row.artifact_id &&
  row.publication_status === "COMPLETED" &&
  row.publication_model_version === row.model_version &&
  row.publication_model_authority === modelAuthority(row.model_version) &&
  row.publication_report_sha256 === payloadHash &&
  row.publication_proof_sha256 === proof.sha256 &&
  canonicalizeReaderSummaryWeeklyJson(
    row.publication_exact_proof,
    "publication ledger proof",
  ).json === proofJson &&
  row.publication_outbox_event_id === null &&
  row.publication_timestamps_match === true &&
  row.publication_artifact_timestamp_match === true;

const slotMatches = (row: PrismaReaderSummaryWeeklyPublicationRecord): boolean =>
  row.slot_tenant_id === row.tenant_id &&
  row.slot_workspace_id === row.workspace_id &&
  row.slot_scope_type === row.scope_type && row.slot_scope_key === row.scope_key &&
  row.slot_cadence === "weekly" &&
  row.slot_period_started_at?.getTime() === row.period_started_at.getTime() &&
  row.slot_period_ended_at?.getTime() === row.period_ended_at.getTime() &&
  row.slot_period_timezone === "UTC" &&
  row.slot_current_publication_id === row.publication_id &&
  row.slot_publication_timestamp_match === true;

const assertProofEvidence = (proof: ReaderSummaryWeeklyPublicationProof): void => {
  assertReaderSummaryWeeklyDenseArray(proof.authorities, "proof authorities");
  assertReaderSummaryWeeklyDenseArray(proof.citations, "proof citations");
  const start = Date.parse(`${proof.weekStartedOn}T00:00:00.000Z`);
  if (
    !Number.isFinite(start) ||
    !isSha(proof.manifestSealSha256) ||
    !isSha(proof.modelInputSealSha256) ||
    !isSha(proof.artifactSha256) ||
    !isSha(proof.editorialQualitySha256) ||
    proof.weekEndedOn !== new Date(start + 6 * 86_400_000).toISOString().slice(0, 10) ||
    new Date(start).getUTCDay() !== 1 ||
    proof.manifestSealId !==
      `reader_summary.weekly_certification_seal.v1:${proof.manifestSealSha256}` ||
    proof.modelInputSealId !==
      `reader_summary.weekly_model_input.v1:${proof.modelInputSealSha256}`
  ) {
    throw new Error("Reader summary weekly certified proof binding is invalid");
  }
  const authorityByDay = new Map<string, Readonly<Record<string, unknown>>>();
  proof.authorities.forEach((authority, index) => {
    assertReaderSummaryWeeklyExactObject(authority, authorityKeys, "proof authority");
    const expectedDay = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    if (authority.requestedUtcDate !== expectedDay || !hasExactHashes(authority)) {
      throw new Error("Reader summary weekly proof authority is invalid");
    }
    authorityByDay.set(authority.requestedUtcDate, authority);
  });
  proof.citations.forEach((citation) => {
    assertReaderSummaryWeeklyExactObject(citation, citationKeys, "proof citation");
    const authority = authorityByDay.get(citation.requestedUtcDate);
    if (
      authority === undefined || citation.publicationId !== authority.publicationId ||
      citation.publicationEvidenceIdentity !== authority.publicationEvidenceIdentity ||
      !isText(citation.citationId) || !isText(citation.providerKey) ||
      !isText(citation.feedItemId) || !isText(citation.sourceItemId) ||
      !isText(citation.sourceBindingId) || !isText(citation.providerItemId) ||
      !isText(citation.canonicalUrl) || !isSha(citation.sourceContentHash)
    ) {
      throw new Error("Reader summary weekly proof citation is invalid");
    }
  });
};

const hasExactHashes = (value: Readonly<Record<string, unknown>>): boolean =>
  isText(value.publicationId) && isText(value.publicationEvidenceIdentity) &&
  isSha(value.publicationEvidenceSha256) && isText(value.storyAuthorityIdentity) &&
  isSha(value.storyAuthoritySha256) && isText(value.githubBoardIdentity) &&
  isSha(value.githubBoardSha256);
const isSha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0;
const sameJson = (left: unknown, right: unknown): boolean =>
  canonicalizeReaderSummaryWeeklyJson(left).json ===
    canonicalizeReaderSummaryWeeklyJson(right).json;
const nextUtcDay = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString();
const modelAuthority = (version: string): number => {
  const normalized = version.trim().toLowerCase();
  if (normalized.startsWith("codex:") || normalized.startsWith("claude:") ||
      normalized.includes("agent-runtime")) return 3;
  return normalized.includes("deterministic") ? 1 : 2;
};
