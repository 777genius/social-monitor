import { createHash } from "node:crypto";

import type { Pool } from "pg";

import type { PrismaReaderSummaryArtifactRecord } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  tenantId,
  type TenantId,
  workspaceId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import {
  message,
  nextDate,
  roundMetric,
} from "./yesterday-social-replay-support";

export type ReaderSummaryQualityScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
};

export type ReaderSummaryExactArtifactTarget = {
  readonly artifactId: string;
  readonly collectionDate: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scopeType: "workspace";
  readonly scopeKey: string;
  readonly periodKey: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly rankingPolicyVersion: string;
};

export type ReaderSummaryExactArtifact = {
  readonly record: PrismaReaderSummaryArtifactRecord;
  /**
   * SHA-256 of UTF-8 canonical JSON. Object keys are sorted recursively by
   * UTF-16 code unit, array order is preserved, and JSON primitives use
   * JSON.stringify encoding. This avoids depending on PostgreSQL jsonb text
   * formatting or JavaScript object insertion order.
   */
  readonly artifactPayloadSha256: string;
};

export type ProviderCount = {
  readonly providerKey: string;
  readonly count: number;
};

export async function readDominantReaderSummaryQualityScope(
  pool: Pool,
  collectionDate: string,
): Promise<ReaderSummaryQualityScope> {
  const result = await pool.query<{
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly feedItemCount: string;
  }>(
    `
      select
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        count(*)::text as "feedItemCount"
      from feed_items
      where published_at >= $1::timestamptz
        and published_at < $2::timestamptz
      group by tenant_id, workspace_id
      order by count(*) desc
      limit 1
    `,
    [dayStart(collectionDate), dayEnd(collectionDate)],
  );
  const row = result.rows[0];
  if (row === undefined || Number.parseInt(row.feedItemCount, 10) === 0) {
    throw new Error(`No feed items found for ${collectionDate}`);
  }

  return {
    tenantId: tenantId(row.tenantId),
    workspaceId: workspaceId(row.workspaceId),
  };
}

export async function readLatestReaderSummaryArtifact(
  pool: Pool,
  scope: ReaderSummaryQualityScope,
  collectionDate: string,
): Promise<PrismaReaderSummaryArtifactRecord | null> {
  const result = await pool.query<PrismaReaderSummaryArtifactRecord>(
    `
      select
        id::text as "id",
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        scope_type as "scopeType",
        scope_key as "scopeKey",
        interest_id::text as "interestId",
        cadence as "cadence",
        period_started_at as "periodStartedAt",
        period_ended_at as "periodEndedAt",
        period_timezone as "periodTimezone",
        period_key as "periodKey",
        user_id::text as "userId",
        subscription_id::text as "subscriptionId",
        status::text as "status",
        schema_version as "schemaVersion",
        model_version as "modelVersion",
        prompt_version as "promptVersion",
        headline as "headline",
        summary_text as "summaryText",
        artifact_payload as "artifactPayload",
        citations as "citations",
        quality_signals as "qualitySignals",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from reader_summary_artifacts
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and scope_type = 'workspace'
        and cadence = 'daily'
        and period_key = $3
        and status = 'COMPLETED'
      order by created_at desc, id desc
      limit 1
    `,
    [scope.tenantId, scope.workspaceId, dailyPeriodKey(collectionDate)],
  );

  return result.rows[0] ?? null;
}

export async function readExactReaderSummaryArtifact(
  pool: Pool,
  target: ReaderSummaryExactArtifactTarget,
): Promise<ReaderSummaryExactArtifact | null> {
  const result = await pool.query<PrismaReaderSummaryArtifactRecord>(
    `
      select
        id::text as "id",
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        scope_type as "scopeType",
        scope_key as "scopeKey",
        interest_id::text as "interestId",
        cadence as "cadence",
        period_started_at as "periodStartedAt",
        period_ended_at as "periodEndedAt",
        period_timezone as "periodTimezone",
        period_key as "periodKey",
        user_id::text as "userId",
        subscription_id::text as "subscriptionId",
        status::text as "status",
        schema_version as "schemaVersion",
        model_version as "modelVersion",
        prompt_version as "promptVersion",
        headline as "headline",
        summary_text as "summaryText",
        artifact_payload as "artifactPayload",
        citations as "citations",
        quality_signals as "qualitySignals",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from reader_summary_artifacts
      where id = $1::uuid
        and tenant_id = $2::uuid
        and workspace_id = $3::uuid
        and scope_type = $4
        and scope_key = $5
        and cadence = 'daily'
        and period_key = $6
        and period_started_at = $7::timestamptz
        and period_ended_at = $8::timestamptz
        and period_timezone = 'UTC'
        and status = 'COMPLETED'
        and model_version = $9
        and prompt_version = $10
        and artifact_payload #>> '{lineage,rankingPolicyVersion}' = $11
      limit 1
    `,
    [
      target.artifactId,
      target.tenantId,
      target.workspaceId,
      target.scopeType,
      target.scopeKey,
      target.periodKey,
      dayStart(target.collectionDate),
      dayEnd(target.collectionDate),
      target.modelVersion,
      target.promptVersion,
      target.rankingPolicyVersion,
    ],
  );
  const record = result.rows[0];
  if (record === undefined) {
    return null;
  }

  return {
    record,
    artifactPayloadSha256: canonicalJsonSha256(record.artifactPayload),
  };
}

export function canonicalJsonSha256(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalJsonValue(value));
  if (serialized === undefined) {
    throw new Error("Canonical JSON root must be a JSON value");
  }
  return serialized;
}

function canonicalJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON numbers must be finite");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJsonValue(value[key])]),
    );
  }
  throw new Error("Canonical JSON contains a non-JSON value");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function countBy<TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => string,
): readonly ProviderCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyOf(value).trim();
    if (key.length === 0) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([providerKey, count]) => ({ providerKey, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.providerKey.localeCompare(right.providerKey),
    );
}

export function primaryCounts(
  primarySources: readonly string[],
  counts: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    primarySources.map((providerKey) => [
      providerKey,
      counts[providerKey] ?? 0,
    ]),
  );
}

export function sumPrimaryCounts(
  primarySources: readonly string[],
  values: readonly Record<string, number>[],
): Record<string, number> {
  return Object.fromEntries(
    primarySources.map((providerKey) => [
      providerKey,
      values.reduce((sum, item) => sum + (item[providerKey] ?? 0), 0),
    ]),
  );
}

export function providerSkew(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }

  return roundMetric(Math.max(...values) / total);
}

export function averageMetric(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

export function dayStart(collectionDate: string): string {
  return `${collectionDate}T00:00:00.000Z`;
}

export function dayEnd(collectionDate: string): string {
  return new Date(nextDate(collectionDate)).toISOString();
}

export function dailyPeriodKey(collectionDate: string): string {
  return `daily:${dayStart(collectionDate)}:${dayEnd(collectionDate)}:UTC`;
}

export function readMetadataString(
  metadata: unknown,
  key: string,
): string | undefined {
  return stringValue(asRecord(metadata)[key]);
}

export function readMetadataNumber(
  metadata: unknown,
  key: string,
): number | undefined {
  const value = asRecord(metadata)[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseHost(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}

export function isLocalDataSourceUnavailable(error: unknown): boolean {
  const code =
    typeof (error as { readonly code?: unknown }).code === "string"
      ? String((error as { readonly code: string }).code)
      : "";
  const text = message(error).toLowerCase();

  return (
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH"].includes(code) ||
    text.includes("connect econnrefused") ||
    text.includes("connection terminated") ||
    text.includes("timeout exceeded") ||
    text.includes("connection refused")
  );
}
