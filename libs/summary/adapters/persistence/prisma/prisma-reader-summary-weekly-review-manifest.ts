import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import {
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  readerSummaryWeeklyScopeKey,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyReviewManifestSchemaVersion,
  type ReaderSummaryWeeklyReviewManifest,
} from "../../../domain/value-objects/reader-summary-weekly-review-manifest";
import type {
  FindReaderSummaryWeeklyReviewManifestQuery,
  PersistReaderSummaryWeeklyReviewManifestCommand,
  PersistReaderSummaryWeeklyReviewManifestResult,
  ReaderSummaryWeeklyReviewManifestPort,
} from "../../../ports/reader-summary-weekly-review-manifest.port";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import { runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";

type WeeklyReviewManifestRow = Readonly<{
  manifest_id: string;
  manifest_sha256: string;
  tenant_id: string;
  workspace_id: string;
  scope_type: string;
  scope_key: string;
  week_started_on: string;
  week_ended_on: string;
  seal_id: string;
  seal_sha256: string;
  review_authority: unknown;
  review_authority_sha256: string;
  observations: unknown;
  citations: unknown;
  model_response_sha256: string;
  execution_attestation: unknown;
  execution_attestation_sha256: string;
  canonical_record: unknown;
  canonical_bytes: Uint8Array;
}>;

type PersistRow = Readonly<{
  outcome: string;
  manifest_id: string;
  manifest_sha256: string;
  seal_id: string;
}>;

const manifestRecordKeys = [
  "schemaVersion", "tenantId", "workspaceId", "scope", "scopeKey",
  "weekStartedOn", "weekEndedOn", "sealId", "sealSha256",
  "reviewAuthority", "reviewAuthoritySha256", "observations", "citations",
  "modelResponseSha256", "executionAttestation", "executionAttestationSha256",
  "manifestId", "manifestSha256",
] as const;

export class PrismaReaderSummaryWeeklyReviewManifest
  implements ReaderSummaryWeeklyReviewManifestPort
{
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async findBySeal(
    query: FindReaderSummaryWeeklyReviewManifestQuery,
  ): Promise<ReaderSummaryWeeklyReviewManifest | null> {
    const exact = exactQuery(query);
    const rows = await this.prisma.$queryRaw<readonly WeeklyReviewManifestRow[]>`
      SELECT
        "manifest_id", btrim("manifest_sha256") AS "manifest_sha256",
        "tenant_id"::text AS "tenant_id", "workspace_id"::text AS "workspace_id",
        "scope_type", "scope_key",
        to_char("week_started_on", 'YYYY-MM-DD') AS "week_started_on",
        to_char("week_ended_on", 'YYYY-MM-DD') AS "week_ended_on",
        "seal_id", btrim("seal_sha256") AS "seal_sha256",
        "review_authority", btrim("review_authority_sha256")
          AS "review_authority_sha256",
        "observations", "citations",
        btrim("model_response_sha256") AS "model_response_sha256",
        "execution_attestation", btrim("execution_attestation_sha256")
          AS "execution_attestation_sha256",
        "canonical_record", "canonical_bytes"
      FROM "reader_summary_weekly_review_manifests"
      WHERE "tenant_id" = ${exact.tenantId}::uuid
        AND "workspace_id" = ${exact.workspaceId}::uuid
        AND "scope_type" = ${exact.scope.type}
        AND "scope_key" = ${readerSummaryWeeklyScopeKey(exact.scope)}
        AND "week_started_on" = ${exact.weekStartedOn}::date
        AND "seal_id" = ${exact.sealId}
      LIMIT 2
    `;
    if (rows.length === 0) return null;
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error("Reader summary weekly review manifest lookup is ambiguous");
    }
    return manifestFromRow(rows[0], exact);
  }

  async persist(
    command: PersistReaderSummaryWeeklyReviewManifestCommand,
  ): Promise<PersistReaderSummaryWeeklyReviewManifestResult> {
    assertReaderSummaryWeeklyExactObject(
      command,
      ["manifest"],
      "weekly review manifest persistence command",
    );
    const manifest = command.manifest;
    const serialized = JSON.stringify(buildReaderSummaryWeeklyReviewManifestPersistencePayload(manifest));
    const rows = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(this.prisma, async (prisma) => {
        await prisma.$queryRaw`
          SELECT
            set_config('social_monitor.tenant_id', ${manifest.tenantId}, true),
            set_config('social_monitor.workspace_id', ${manifest.workspaceId}, true),
            set_config('social_monitor.system_access', 'false', true)
        `;
        return prisma.$queryRaw<readonly PersistRow[]>`
          SELECT *
          FROM "persist_reader_summary_weekly_review_manifest"(${serialized}::jsonb)
        `;
      }),
    );
    const row = rows[0];
    if (
      rows.length !== 1 ||
      row === undefined ||
      (row.outcome !== "persisted" && row.outcome !== "replayed") ||
      row.manifest_id !== manifest.manifestId ||
      row.manifest_sha256 !== manifest.manifestSha256 ||
      row.seal_id !== manifest.sealId
    ) {
      throw new Error("PostgreSQL weekly review manifest persistence proof diverged");
    }
    return Object.freeze({ outcome: row.outcome, manifest });
  }
}

export const buildReaderSummaryWeeklyReviewManifestPersistencePayload = (
  manifest: ReaderSummaryWeeklyReviewManifest,
): Readonly<Record<string, unknown>> => {
  const authority = canonicalizeReaderSummaryWeeklyJson(
    manifest.reviewAuthority,
    "weekly review persistence authority",
  );
  const attestation = canonicalizeReaderSummaryWeeklyJson(
    manifest.executionAttestation,
    "weekly review persistence attestation",
  );
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: "reader_summary.weekly_review_manifest_persistence.v1",
    manifestId: manifest.manifestId,
    manifestSha256: manifest.manifestSha256,
    tenantId: manifest.tenantId,
    workspaceId: manifest.workspaceId,
    scope: manifest.scope,
    scopeKey: manifest.scopeKey,
    weekStartedOn: manifest.weekStartedOn,
    weekEndedOn: manifest.weekEndedOn,
    sealId: manifest.sealId,
    sealSha256: manifest.sealSha256,
    reviewAuthority: manifest.reviewAuthority,
    reviewAuthoritySha256: manifest.reviewAuthoritySha256,
    reviewAuthorityBytesBase64: Buffer.from(authority.toBytes()).toString("base64"),
    observations: manifest.observations,
    citations: manifest.citations,
    modelResponseSha256: manifest.modelResponseSha256,
    executionAttestation: manifest.executionAttestation,
    executionAttestationSha256: manifest.executionAttestationSha256,
    executionAttestationBytesBase64: Buffer.from(attestation.toBytes()).toString("base64"),
    canonicalRecord: manifest.canonicalRecord,
    canonicalBytesBase64: Buffer.from(manifest.toBytes()).toString("base64"),
  });
};

const exactQuery = (
  query: FindReaderSummaryWeeklyReviewManifestQuery,
): FindReaderSummaryWeeklyReviewManifestQuery => {
  assertReaderSummaryWeeklyExactObject(
    query,
    ["tenantId", "workspaceId", "scope", "weekStartedOn", "sealId"],
    "weekly review manifest query",
  );
  const weekStartedOn = exactReaderSummaryWeeklyUtcDay(query.weekStartedOn);
  if (new Date(`${weekStartedOn}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw new Error("Reader summary weekly review manifest query must start Monday");
  }
  return {
    tenantId: exactReaderSummaryWeeklyIdentity(query.tenantId, "review manifest tenant id"),
    workspaceId: exactReaderSummaryWeeklyIdentity(
      query.workspaceId,
      "review manifest workspace id",
    ),
    scope: canonicalReaderSummaryWeeklyScope(query.scope),
    weekStartedOn,
    sealId: exactReaderSummaryWeeklyIdentity(query.sealId, "review manifest seal id"),
  };
};

const manifestFromRow = (
  row: WeeklyReviewManifestRow,
  query: FindReaderSummaryWeeklyReviewManifestQuery,
): ReaderSummaryWeeklyReviewManifest => {
  const record = row.canonical_record;
  assertReaderSummaryWeeklyExactObject(
    record,
    manifestRecordKeys,
    "persisted weekly review manifest record",
    { allowAuthoritativeHashes: true },
  );
  const body = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== "manifestId" && key !== "manifestSha256",
    ),
  );
  const canonical = canonicalizeReaderSummaryWeeklyJson(body, "persisted weekly review manifest");
  const recordValues = record as Readonly<Record<string, unknown>>;
  const bytes = exactBytes(row.canonical_bytes);
  const scope = canonicalReaderSummaryWeeklyScope(recordValues.scope as never);
  const scopeKey = readerSummaryWeeklyScopeKey(scope);
  if (
    recordValues.schemaVersion !== readerSummaryWeeklyReviewManifestSchemaVersion ||
    recordValues.manifestId !== `${readerSummaryWeeklyReviewManifestSchemaVersion}:${canonical.sha256}` ||
    recordValues.manifestSha256 !== canonical.sha256 ||
    row.manifest_id !== recordValues.manifestId ||
    exactReaderSummaryWeeklySha256(row.manifest_sha256, "persisted review manifest hash") !== canonical.sha256 ||
    Buffer.from(canonical.toBytes()).compare(bytes) !== 0 ||
    row.tenant_id !== query.tenantId ||
    row.workspace_id !== query.workspaceId ||
    row.scope_type !== scope.type ||
    row.scope_key !== scopeKey ||
    row.week_started_on !== query.weekStartedOn ||
    row.week_ended_on !== utcDateAfter(query.weekStartedOn, 6) ||
    row.seal_id !== query.sealId ||
    row.tenant_id !== recordValues.tenantId ||
    row.workspace_id !== recordValues.workspaceId ||
    row.scope_type !== (recordValues.scope as { type?: unknown }).type ||
    row.scope_key !== recordValues.scopeKey ||
    row.week_started_on !== recordValues.weekStartedOn ||
    row.week_ended_on !== recordValues.weekEndedOn ||
    row.seal_id !== recordValues.sealId ||
    row.seal_sha256 !== recordValues.sealSha256 ||
    row.review_authority_sha256 !== recordValues.reviewAuthoritySha256 ||
    canonicalizeReaderSummaryWeeklyJson(row.review_authority).json !==
      canonicalizeReaderSummaryWeeklyJson(recordValues.reviewAuthority).json ||
    canonicalizeReaderSummaryWeeklyJson(row.observations).json !==
      canonicalizeReaderSummaryWeeklyJson(recordValues.observations).json ||
    canonicalizeReaderSummaryWeeklyJson(row.citations).json !==
      canonicalizeReaderSummaryWeeklyJson(recordValues.citations).json ||
    row.model_response_sha256 !== recordValues.modelResponseSha256 ||
    canonicalizeReaderSummaryWeeklyJson(row.execution_attestation).json !==
      canonicalizeReaderSummaryWeeklyJson(recordValues.executionAttestation).json ||
    row.execution_attestation_sha256 !== recordValues.executionAttestationSha256
  ) {
    throw new Error("Reader summary weekly review manifest row diverged from canonical record");
  }
  return deepFreezeReaderSummaryWeekly({
    ...(body as Omit<ReaderSummaryWeeklyReviewManifest, "canonicalRecord" | "canonicalJson" | "byteLength" | "toBytes">),
    manifestId: row.manifest_id,
    manifestSha256: canonical.sha256,
    canonicalRecord: deepFreezeReaderSummaryWeekly({ ...recordValues }),
    canonicalJson: canonical.json,
    byteLength: canonical.byteLength,
    toBytes: (): Uint8Array => canonical.toBytes(),
  });
};

const exactBytes = (value: unknown): Buffer => {
  if (!(value instanceof Uint8Array)) {
    throw new Error("Reader summary weekly review manifest bytes are invalid");
  }
  return Buffer.from(value);
};

const utcDateAfter = (date: string, offset: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
