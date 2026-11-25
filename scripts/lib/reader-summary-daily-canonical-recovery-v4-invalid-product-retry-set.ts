import { createHash } from "node:crypto";

import type { ReaderSummaryDailySqlClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

/** This is intentionally narrower than the historical single-date Jul23 path. */
export const invalidProductRetrySetToken = "invalid-product-retry-set-v1" as const;
export const invalidProductRetryDates = Object.freeze([
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
] as const);

export type InvalidProductRetryDate = typeof invalidProductRetryDates[number];

export type InvalidProductRetrySetAuthorization = Readonly<{
  requestedUtcDate: InvalidProductRetryDate;
  modelJobIdentity: string;
  authorizationSha256: string;
}>;

export type InvalidProductRetrySetAuthorizer = Readonly<{
  authorize(input: Readonly<{
    tenantId: string;
    workspaceId: string;
    terminalSetSha256: string;
  }>): Promise<readonly InvalidProductRetrySetAuthorization[]>;
}>;

/**
 * The SQL function owns every historical predicate and replay decision. This
 * adapter only accepts a lower-case terminal-set digest and a fixed result set;
 * it never carries a provider payload or per-date authorization input.
 */
export class PostgresCanonicalRecoveryInvalidProductRetrySetAuthorizer
  implements InvalidProductRetrySetAuthorizer
{
  constructor(private readonly client: ReaderSummaryDailySqlClient) {}

  async authorize(input: Parameters<InvalidProductRetrySetAuthorizer["authorize"]>[0]) {
    const digest = terminalSetSha256(input.terminalSetSha256);
    return this.client.serializable(async (transaction) => {
      const result = await transaction.query<Record<string, unknown>>(
        `SELECT * FROM public."authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set"(
          $1::UUID,$2::UUID,$3::CHAR(64)
        )`,
        [input.tenantId, input.workspaceId, digest],
      );
      if (result.rows.length !== invalidProductRetryDates.length) {
        throw new Error("Daily canonical recovery invalid-product authorization coverage is invalid");
      }
      const authorizations = result.rows.map((row) => Object.freeze({
        requestedUtcDate: retryDate(row.requested_utc_date),
        modelJobIdentity: terminalSetSha256(row.model_job_identity),
        authorizationSha256: terminalSetSha256(row.authorization_sha256),
      }));
      if (
        authorizations.some((entry, index) =>
          entry.requestedUtcDate !== invalidProductRetryDates[index])
      ) {
        throw new Error("Daily canonical recovery invalid-product authorization order is invalid");
      }
      return Object.freeze(authorizations);
    });
  }
}

/**
 * Canonical digest input used by tests/auditors to independently reproduce the
 * closed SQL terminal-set identity. No raw model output belongs in this set.
 */
export const canonicalInvalidProductRetrySetSha256 = (entries: readonly Readonly<{
  requestedUtcDate: InvalidProductRetryDate;
  modelJobIdentity: string;
  sourceAuthoritySha256: string;
}>[]): string => {
  if (entries.length !== invalidProductRetryDates.length) {
    throw new Error("Daily canonical recovery invalid-product terminal set coverage is invalid");
  }
  const ordered = [...entries].sort((left, right) =>
    left.requestedUtcDate.localeCompare(right.requestedUtcDate));
  if (ordered.some((entry, index) =>
    entry.requestedUtcDate !== invalidProductRetryDates[index] ||
    !/^[0-9a-f]{64}$/u.test(entry.modelJobIdentity) ||
    !/^[0-9a-f]{64}$/u.test(entry.sourceAuthoritySha256))) {
    throw new Error("Daily canonical recovery invalid-product terminal set is invalid");
  }
  const canonical = ordered.map((entry) => [
    entry.requestedUtcDate,
    entry.modelJobIdentity,
    entry.sourceAuthoritySha256,
    "FAILED_AMBIGUOUS",
    "negative_fence",
    "invalid_product",
  ].join("|")).join("\n");
  return createHash("sha256")
    .update(`${invalidProductRetrySetToken}\n${canonical}`, "utf8")
    .digest("hex");
};

const retryDate = (value: unknown): InvalidProductRetryDate => {
  const date = value instanceof Date
    ? `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1)
      .toString().padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}`
    : typeof value === "string" ? value : "";
  if (!(invalidProductRetryDates as readonly string[]).includes(date)) {
    throw new Error("Daily canonical recovery invalid-product date is invalid");
  }
  return date as InvalidProductRetryDate;
};

const terminalSetSha256 = (value: unknown): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Daily canonical recovery invalid-product terminal-set SHA-256 is invalid");
  }
  return value;
};
