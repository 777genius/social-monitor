import { createHash } from "node:crypto";

import type { ReaderSummaryDailySqlClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

/** The immutable recovery window. No caller may widen or reorder it. */
export const canonicalRecoveryDates = Object.freeze([
  "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26",
  "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30",
] as const);

export type CanonicalRecoveryDate = typeof canonicalRecoveryDates[number];
export type CanonicalRecoveryLeaseState =
  | "RESERVED"
  | "COMPLETED"
  | "PUBLICATION_PENDING"
  | "FINALIZED";

export type CanonicalRecoveryWork = Readonly<{
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: CanonicalRecoveryDate;
  sourceAuthorityBytes: Buffer;
  sourceAuthoritySha256: string;
  modelJobIdentity: string;
  state: CanonicalRecoveryLeaseState;
  workerId: string;
  fencingToken: bigint;
  leasedAt: string;
  leaseExpiresAt: string;
  absoluteExpiresAt: string;
  completedAt?: string;
  responseBytes?: Buffer;
  receiptBytes?: Buffer;
}>;

export type CanonicalRecoveryClaim =
  | Readonly<{ kind: "claimed"; work: CanonicalRecoveryWork }>
  | Readonly<{ kind: "caught_up" }>
  | Readonly<{
      kind: "leased" | "failed_ambiguous";
      requestedUtcDate: CanonicalRecoveryDate;
    }>;

export type CanonicalRecoveryPublication = Readonly<{
  requestedUtcDate: CanonicalRecoveryDate;
  sourceAuthoritySha256: string;
  modelJobIdentity: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  publicationId: string;
  reportSha256: string;
  proofSha256: string;
  weeklyEvidenceSha256: string;
  publicEvidenceSha256: string;
  publicFrontendSha256: string;
}>;

export interface CanonicalRecoveryAuthority {
  claim(input: Readonly<{
    tenantId: string;
    workspaceId: string;
    workerId: string;
    invokedAt: string;
  }>): Promise<CanonicalRecoveryClaim>;
  markRunning(work: CanonicalRecoveryWork, at: string): Promise<void>;
  renew(work: CanonicalRecoveryWork, at: string): Promise<CanonicalRecoveryWork>;
  complete(work: CanonicalRecoveryWork, input: Readonly<{
    completedAt: string;
    responseBytes: Buffer;
    responseSha256: string;
    attestation: Readonly<Record<string, unknown>>;
    attestationBytes: Buffer;
    attestationSha256: string;
    receiptBytes: Buffer;
    receiptSha256: string;
  }>): Promise<CanonicalRecoveryWork>;
  readFinalized(input: Readonly<{
    tenantId: string;
    workspaceId: string;
  }>): Promise<readonly CanonicalRecoveryPublication[]>;
}

export interface CanonicalRecoveryFinalizer {
  finalize(input: Readonly<{
    work: CanonicalRecoveryWork;
    responseBytes: Buffer;
    receiptBytes: Buffer;
  }>): Promise<CanonicalRecoveryPublication>;
}

/**
 * The dedicated terminal login can invoke only the narrow v4 SQL functions.
 * All transitions run in a SERIALIZABLE transaction supplied by the connection
 * factory; this adapter never falls back to a generic client query.
 */
export class PostgresCanonicalRecoveryAuthority
  implements CanonicalRecoveryAuthority
{
  constructor(private readonly client: ReaderSummaryDailySqlClient) {}

  async claim(input: Parameters<CanonicalRecoveryAuthority["claim"]>[0]) {
    return this.client.serializable(async (transaction) => {
      const result = await transaction.query<Record<string, unknown>>(
        `SELECT * FROM public."claim_reader_summary_daily_canonical_recovery_v4"(
          $1::UUID,$2::UUID,$3::TEXT,$4::TIMESTAMPTZ
        )`,
        [input.tenantId, input.workspaceId, input.workerId, input.invokedAt],
      );
      const row = one(result.rows, "claim");
      const outcome = text(row.outcome);
      if (outcome === "CAUGHT_UP") return { kind: "caught_up" as const };
      const requestedUtcDate = recoveryDate(row.requested_utc_date);
      if (outcome === "LEASED" || outcome === "FAILED_AMBIGUOUS") {
        return {
          kind: outcome.toLowerCase() as "leased" | "failed_ambiguous",
          requestedUtcDate,
        };
      }
      if (outcome !== "CLAIMED") {
        throw new Error("Daily canonical recovery claim outcome is invalid");
      }
      return {
        kind: "claimed" as const,
        work: workFromRow(
          row,
          input.workerId,
          requestedUtcDate,
          input.tenantId,
          input.workspaceId,
        ),
      };
    });
  }

  markRunning(work: CanonicalRecoveryWork, at: string): Promise<void> {
    return this.write(
      "mark_reader_summary_daily_canonical_recovery_v4_running",
      work,
      at,
    );
  }

  async renew(
    work: CanonicalRecoveryWork,
    at: string,
  ): Promise<CanonicalRecoveryWork> {
    return this.client.serializable(async (transaction) => {
      const result = await transaction.query<Record<string, unknown>>(
        `SELECT * FROM public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
          $1::UUID,$2::UUID,$3::DATE,$4::TEXT,$5::BIGINT,$6::TIMESTAMPTZ
        )`,
        [
          work.tenantId,
          work.workspaceId,
          work.requestedUtcDate,
          work.workerId,
          work.fencingToken,
          at,
        ],
      );
      const row = one(result.rows, "renewal");
      const workerId = text(row.lease_owner);
      const fencingToken = BigInt(bigintText(row.fencing_token));
      if (workerId !== work.workerId || fencingToken !== work.fencingToken) {
        throw new Error("Daily canonical recovery renewal returned a stale fence");
      }
      return Object.freeze({
        ...work,
        workerId,
        fencingToken,
        leasedAt: iso(row.leased_at, "renewed lease start"),
        leaseExpiresAt: iso(row.lease_expires_at, "renewed lease expiry"),
        absoluteExpiresAt: iso(row.absolute_expires_at, "renewed absolute lease expiry"),
      });
    });
  }

  async complete(
    work: CanonicalRecoveryWork,
    input: Parameters<CanonicalRecoveryAuthority["complete"]>[1],
  ): Promise<CanonicalRecoveryWork> {
    return this.client.serializable(async (transaction) => {
      const result = await transaction.query<Record<string, unknown>>(
        `SELECT * FROM public."complete_reader_summary_daily_canonical_recovery_v4"(
          $1::UUID,$2::UUID,$3::DATE,$4::TEXT,$5::BIGINT,$6::TIMESTAMPTZ,
          $7::BYTEA,$8::CHAR(64),$9::JSONB,$10::BYTEA,$11::CHAR(64),
          $12::BYTEA,$13::CHAR(64)
        )`,
        [
          work.tenantId,
          work.workspaceId,
          work.requestedUtcDate,
          work.workerId,
          work.fencingToken,
          input.completedAt,
          input.responseBytes,
          input.responseSha256,
          JSON.stringify(input.attestation),
          input.attestationBytes,
          input.attestationSha256,
          input.receiptBytes,
          input.receiptSha256,
        ],
      );
      const row = one(result.rows, "completion");
      return Object.freeze({
        ...work,
        state: "COMPLETED" as const,
        completedAt: iso(row.db_completed_at, "DB completion time"),
        responseBytes: Buffer.from(input.responseBytes),
        receiptBytes: Buffer.from(input.receiptBytes),
      });
    });
  }

  async readFinalized(
    input: Parameters<CanonicalRecoveryAuthority["readFinalized"]>[0],
  ): Promise<readonly CanonicalRecoveryPublication[]> {
    return this.client.serializable(async (transaction) => {
      const result = await transaction.query<Record<string, unknown>>(
        `SELECT * FROM public."read_reader_summary_daily_canonical_recovery_v4_finalized"(
          $1::UUID,$2::UUID
        )`,
        [input.tenantId, input.workspaceId],
      );
      return result.rows.map(publicationFromRow);
    });
  }

  private async write(
    functionName: string,
    work: CanonicalRecoveryWork,
    at: string,
  ): Promise<void> {
    if (functionName !== "mark_reader_summary_daily_canonical_recovery_v4_running") {
      throw new Error("Daily canonical recovery transition function is invalid");
    }
    await this.client.serializable(async (transaction) => {
      await transaction.query(
        `SELECT * FROM public."${functionName}"(
          $1::UUID,$2::UUID,$3::DATE,$4::TEXT,$5::BIGINT,$6::TIMESTAMPTZ
        )`,
        [
          work.tenantId,
          work.workspaceId,
          work.requestedUtcDate,
          work.workerId,
          work.fencingToken,
          at,
        ],
      );
    });
  }
}

export const canonicalJsonBytes = (value: unknown): Buffer =>
  Buffer.from(canonicalJson(value), "utf8");

export const sha256 = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");

/** Rejects whitespace, duplicate/unknown top-level fields, and noncanonical JSON. */
export const parseStrictDailyOutputText = (outputText: string): Buffer => {
  if (
    outputText.length === 0 ||
    outputText.trim() !== outputText ||
    Buffer.byteLength(outputText, "utf8") > 1_000_000
  ) {
    throw new Error("Daily canonical recovery output_text framing is invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(outputText) as unknown;
  } catch {
    throw new Error("Daily canonical recovery output_text is not JSON");
  }
  assertExactObject(value, dailyOutputKeys, "daily output");
  const record = value as Record<string, unknown>;
  if (
    typeof record.headline !== "string" ||
    typeof record.executiveSummary !== "string" ||
    !Array.isArray(record.narrativeSections) ||
    !isObject(record.content) ||
    !Array.isArray(record.topStories) ||
    !Array.isArray(record.interestHighlights) ||
    !Array.isArray(record.repeatedSignals) ||
    !Array.isArray(record.risksAndUnknowns) ||
    !Array.isArray(record.citationMap) ||
    !Array.isArray(record.qualityFlags) ||
    !isObject(record.confidence) ||
    !(record.noSignalReason === null || typeof record.noSignalReason === "string")
  ) {
    throw new Error("Daily canonical recovery output_text shape is invalid");
  }
  const bytes = canonicalJsonBytes(value);
  if (bytes.toString("utf8") !== outputText) {
    throw new Error("Daily canonical recovery output_text is not canonical JSON");
  }
  return bytes;
};

export const assertDailyOutputMatchesJsonSchema = (
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
): void => validateSchema(value, schema, schema, "output_text");

/**
 * cN is an ordinal into the frozen authority selection. Matching both source
 * identifiers and the provider key prevents a model from inventing citations.
 */
export const assertDailyOutputCitationsMatchSourceAuthority = (
  output: unknown,
  sourceAuthorityBytes: Buffer,
  selectionLimit: number,
): void => {
  let source: unknown;
  try {
    source = JSON.parse(sourceAuthorityBytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("Daily canonical recovery source authority is not JSON");
  }
  if (
    !isObject(source) ||
    !Array.isArray(source.items) ||
    !isObject(output) ||
    !Array.isArray(output.citationMap)
  ) {
    throw new Error("Daily canonical recovery citation authority is invalid");
  }
  const seen = new Set<string>();
  for (const value of output.citationMap) {
    if (!isObject(value) || typeof value.citationId !== "string") {
      throw new Error("Daily canonical recovery citationMap is invalid");
    }
    const match = /^c([1-9][0-9]*)$/u.exec(value.citationId);
    const ordinal = match === null ? 0 : Number(match[1]);
    const item = ordinal <= Math.min(selectionLimit, source.items.length)
      ? source.items[ordinal - 1]
      : undefined;
    if (
      !isObject(item) ||
      seen.has(value.citationId) ||
      value.feedItemId !== item.feedItemId ||
      value.sourceItemId !== item.sourceItemId ||
      value.providerKey !== item.providerKey ||
      value.field !== "canonicalUrl" ||
      typeof item.title !== "string" ||
      item.title.length === 0 ||
      !isLegacyBodyPreview(item.bodyPreview) ||
      typeof item.canonicalUrl !== "string" ||
      item.canonicalUrl.length === 0 ||
      typeof item.contentHash !== "string" ||
      !/^[0-9a-f]{64}$/u.test(item.contentHash)
    ) {
      throw new Error(
        "Daily canonical recovery citationMap diverges from frozen authority",
      );
    }
    seen.add(value.citationId);
  }
};

const isLegacyBodyPreview = (value: unknown): value is string =>
  typeof value === "string";

const dailyOutputKeys = [
  "citationMap",
  "confidence",
  "content",
  "executiveSummary",
  "headline",
  "interestHighlights",
  "narrativeSections",
  "noSignalReason",
  "qualityFlags",
  "repeatedSignals",
  "risksAndUnknowns",
  "topStories",
] as const;

const assertExactObject: (
  value: unknown,
  keys: readonly string[],
  label: string,
) => asserts value is Record<string, unknown> = (value, keys, label) => {
  if (
    !isObject(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys)
  ) {
    throw new Error(`Daily canonical recovery ${label} fields are invalid`);
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Daily canonical recovery value is not canonical JSON");
};

const validateSchema = (
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
  root: Readonly<Record<string, unknown>>,
  path: string,
): void => {
  if (typeof schema.$ref === "string") {
    const target = schema.$ref.split("/").slice(1).reduce<unknown>(
      (current, key) => isObject(current) ? current[key] : undefined,
      root,
    );
    if (!isObject(target)) {
      throw new Error("Daily canonical recovery output schema reference is invalid");
    }
    validateSchema(value, target, root, path);
    return;
  }
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((entry) => Object.is(entry, value))) invalid(path);
    return;
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some((type) => matchesType(value, type))) invalid(path);
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      invalid(path);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      invalid(path);
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) invalid(path);
    if (typeof schema.maximum === "number" && value > schema.maximum) invalid(path);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      invalid(path);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      invalid(path);
    }
    if (isObject(schema.items)) {
      value.forEach((entry, index) =>
        validateSchema(entry, schema.items as Record<string, unknown>, root, `${path}[${index}]`));
    }
  }
  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some((key) => typeof key !== "string" || !(key in value))) {
      invalid(path);
    }
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some((key) => !(key in properties))
    ) {
      invalid(path);
    }
    for (const [key, entry] of Object.entries(value)) {
      const child = properties[key];
      if (isObject(child)) {
        validateSchema(entry, child, root, `${path}.${key}`);
      }
    }
  }
};

const matchesType = (value: unknown, type: unknown): boolean =>
  type === undefined ||
  (type === "null" && value === null) ||
  (type === "object" && isObject(value)) ||
  (type === "array" && Array.isArray(value)) ||
  (type === "string" && typeof value === "string") ||
  (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
  (type === "boolean" && typeof value === "boolean");

const invalid = (path: string): never => {
  throw new Error(
    `Daily canonical recovery output_text violates schema at ${path}`,
  );
};

const one = (rows: readonly Record<string, unknown>[], label: string) => {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(`Daily canonical recovery ${label} returned no row`);
  }
  return rows[0];
};

const text = (value: unknown): string => typeof value === "string" ? value : "";

const bigintText = (value: unknown): string =>
  typeof value === "bigint" || typeof value === "number" ? String(value) : text(value);

const recoveryDate = (value: unknown): CanonicalRecoveryDate => {
  // node-postgres parses DATE as local midnight. Converting that value to UTC
  // moves it to the previous day on positive-offset production hosts, so keep
  // its calendar components instead of using toISOString().
  const date = value instanceof Date && !Number.isNaN(value.getTime())
    ? `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1)
      .toString().padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}`
    : text(value);
  if (!(canonicalRecoveryDates as readonly string[]).includes(date)) {
    throw new Error(
      `Daily canonical recovery database returned a date outside Jul23-Jul30: ${String(value)}`,
    );
  }
  return date as CanonicalRecoveryDate;
};

const buffer = (value: unknown, label: string): Buffer => {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    throw new Error(`Daily canonical recovery ${label} bytes are missing`);
  }
  return Buffer.from(value);
};

const sha = (value: unknown, label: string): string => {
  const result = text(value).trim();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw new Error(`Daily canonical recovery ${label} SHA-256 is invalid`);
  }
  return result;
};

const iso = (value: unknown, label: string): string => {
  const parsed = value instanceof Date ? value : new Date(text(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Daily canonical recovery ${label} is invalid`);
  }
  return parsed.toISOString();
};

const workFromRow = (
  row: Record<string, unknown>,
  workerId: string,
  requestedUtcDate: CanonicalRecoveryDate,
  expectedTenantId: string,
  expectedWorkspaceId: string,
): CanonicalRecoveryWork => {
  const state: CanonicalRecoveryLeaseState =
    row.model_job_state === "COMPLETED"
      ? "COMPLETED"
      : row.model_job_state === "PUBLICATION_PENDING"
        ? "PUBLICATION_PENDING"
        : row.model_job_state === "RESERVED"
          ? "RESERVED"
          : (() => { throw new Error("Daily canonical recovery DB state is invalid"); })();
  const actualTenantId = text(row.tenant_id);
  const actualWorkspaceId = text(row.workspace_id);
  if (
    actualTenantId !== expectedTenantId ||
    actualWorkspaceId !== expectedWorkspaceId
  ) {
    throw new Error("Daily canonical recovery database returned the wrong scope");
  }
  return Object.freeze({
    tenantId: actualTenantId,
    workspaceId: actualWorkspaceId,
    requestedUtcDate,
    sourceAuthorityBytes: buffer(row.source_canonical_bytes, "source authority"),
    sourceAuthoritySha256: sha(row.source_canonical_sha256, "source authority"),
    modelJobIdentity: sha(row.model_job_identity, "model identity"),
    state,
    workerId,
    fencingToken: BigInt(bigintText(row.fencing_token)),
    leasedAt: iso(row.leased_at, "lease start"),
    leaseExpiresAt: iso(row.lease_expires_at, "lease expiry"),
    absoluteExpiresAt: iso(row.absolute_expires_at, "absolute lease expiry"),
    ...(row.completed_at === null || row.completed_at === undefined
      ? {}
      : { completedAt: iso(row.completed_at, "completion time") }),
    ...(row.response_bytes === null || row.response_bytes === undefined
      ? {}
      : { responseBytes: buffer(row.response_bytes, "response") }),
    ...(row.receipt_bytes === null || row.receipt_bytes === undefined
      ? {}
      : { receiptBytes: buffer(row.receipt_bytes, "receipt") }),
  });
};

const publicationFromRow = (
  row: Record<string, unknown>,
): CanonicalRecoveryPublication => Object.freeze({
  requestedUtcDate: recoveryDate(row.requested_utc_date),
  sourceAuthoritySha256: sha(row.source_authority_sha256, "source authority"),
  modelJobIdentity: sha(row.model_job_identity, "model identity"),
  readerSummaryJobId: text(row.reader_summary_job_id),
  readerSummaryArtifactId: text(row.reader_summary_artifact_id),
  publicationId: text(row.publication_id),
  reportSha256: sha(row.report_sha256, "report"),
  proofSha256: sha(row.proof_sha256, "proof"),
  weeklyEvidenceSha256: sha(row.weekly_evidence_sha256, "weekly evidence"),
  publicEvidenceSha256: sha(row.public_evidence_sha256, "public evidence"),
  publicFrontendSha256: sha(row.public_frontend_sha256, "public frontend"),
});
