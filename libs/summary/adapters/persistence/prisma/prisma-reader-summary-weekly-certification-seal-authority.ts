import {
  assertReaderSummaryWeeklyCertificationSealBinding,
  cloneReaderSummaryWeeklyCertificationSealBinding,
  type ReaderSummaryWeeklyCertificationSealBinding,
} from "../../../domain/value-objects/reader-summary-weekly-certification-seal";
import {
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  readerSummaryWeeklyScopeKey,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import type {
  LoadReaderSummaryWeeklyCertificationSealQuery,
  ReaderSummaryWeeklyCertificationSealAuthorityPort,
  ReaderSummaryWeeklyCertificationSealHandle,
} from "../../../ports/reader-summary-weekly-certification-seal-authority.port";
import type { PrismaSummaryClient } from "./prisma-summary-client";

type WeeklyCertificationSealRow = Readonly<{
  sealId: string;
  sealSha: string;
  tenantId: string;
  workspaceId: string;
  scopeType: string;
  scopeKey: string;
  weekStartedOn: Date;
  weekEndedOn: Date;
  days: unknown;
  canonicalRecord: unknown;
  canonicalBytes: Uint8Array;
  recordedAt: Date;
}>;

export class PrismaReaderSummaryWeeklyCertificationSealAuthority
  implements ReaderSummaryWeeklyCertificationSealAuthorityPort
{
  private readonly bindings =
    new WeakMap<object, ReaderSummaryWeeklyCertificationSealBinding>();

  constructor(private readonly prisma: PrismaSummaryClient) {}

  async load(
    query: LoadReaderSummaryWeeklyCertificationSealQuery,
  ): Promise<ReaderSummaryWeeklyCertificationSealHandle | null> {
    const exact = exactQuery(query);
    const scopeKey = readerSummaryWeeklyScopeKey(exact.scope);
    const rows = await this.prisma.$queryRaw<readonly WeeklyCertificationSealRow[]>`
      SELECT
        "seal_id" AS "sealId",
        btrim("seal_sha256") AS "sealSha",
        "tenant_id"::text AS "tenantId",
        "workspace_id"::text AS "workspaceId",
        "scope_type" AS "scopeType",
        "scope_key" AS "scopeKey",
        "week_started_on" AS "weekStartedOn",
        "week_ended_on" AS "weekEndedOn",
        "days",
        "canonical_record" AS "canonicalRecord",
        "canonical_bytes" AS "canonicalBytes",
        "recorded_at" AS "recordedAt"
      FROM "reader_summary_weekly_certification_seals"
      WHERE "tenant_id" = ${exact.tenantId}::uuid
        AND "workspace_id" = ${exact.workspaceId}::uuid
        AND "scope_type" = ${exact.scope.type}
        AND "scope_key" = ${scopeKey}
        AND "week_started_on" = ${exact.weekStartedOn}::date
      LIMIT 2
    `;
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw new Error("Reader summary weekly certification seal lookup was not unique");
    }
    const binding = verifiedBinding(rows[0]!, exact);
    const handle = Object.freeze(Object.create(null) as object);
    this.bindings.set(handle, cloneReaderSummaryWeeklyCertificationSealBinding(binding));
    return handle as ReaderSummaryWeeklyCertificationSealHandle;
  }

  readVerifiedBinding(
    handle: ReaderSummaryWeeklyCertificationSealHandle,
  ): ReaderSummaryWeeklyCertificationSealBinding {
    if (typeof handle !== "object" || handle === null) throw untrustedSeal();
    const binding = this.bindings.get(handle as object);
    if (binding === undefined) throw untrustedSeal();
    assertReaderSummaryWeeklyCertificationSealBinding(binding);
    return cloneReaderSummaryWeeklyCertificationSealBinding(binding);
  }
}

const exactQuery = (
  query: LoadReaderSummaryWeeklyCertificationSealQuery,
): LoadReaderSummaryWeeklyCertificationSealQuery => {
  assertReaderSummaryWeeklyExactObject(
    query,
    ["tenantId", "workspaceId", "scope", "weekStartedOn"],
    "weekly certification seal query",
  );
  const weekStartedOn = exactReaderSummaryWeeklyUtcDay(query.weekStartedOn);
  if (new Date(`${weekStartedOn}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw new Error("Reader summary weekly certification seal query must start Monday");
  }
  return {
    tenantId: exactReaderSummaryWeeklyIdentity(query.tenantId, "seal query tenant id"),
    workspaceId: exactReaderSummaryWeeklyIdentity(
      query.workspaceId,
      "seal query workspace id",
    ),
    scope: canonicalReaderSummaryWeeklyScope(query.scope),
    weekStartedOn,
  };
};

const verifiedBinding = (
  row: WeeklyCertificationSealRow,
  query: LoadReaderSummaryWeeklyCertificationSealQuery,
): ReaderSummaryWeeklyCertificationSealBinding => {
  if (!(row.recordedAt instanceof Date) || !Number.isFinite(row.recordedAt.getTime())) {
    throw new Error("Reader summary weekly certification seal recorded time is invalid");
  }
  const record = row.canonicalRecord;
  assertReaderSummaryWeeklyCertificationSealBinding(record);
  const binding = record as ReaderSummaryWeeklyCertificationSealBinding;
  const body = {
    schemaVersion: binding.schemaVersion,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    scopeType: binding.scopeType,
    scopeKey: binding.scopeKey,
    weekStartedOn: binding.weekStartedOn,
    weekEndedOn: binding.weekEndedOn,
    days: binding.days,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "persisted weekly certification seal body",
  );
  const bytes = exactBytes(row.canonicalBytes);
  const rowStartedOn = exactDate(row.weekStartedOn, "week start");
  const rowEndedOn = exactDate(row.weekEndedOn, "week end");
  const expectedEndedOn = utcDayAfter(query.weekStartedOn, 6);
  if (
    row.sealId !== binding.sealId ||
    exactReaderSummaryWeeklySha256(row.sealSha, "persisted seal hash") !==
      binding.sealSha ||
    Buffer.from(canonical.toBytes()).compare(bytes) !== 0 ||
    canonical.sha256 !== binding.sealSha ||
    canonicalizeReaderSummaryWeeklyJson(row.days).json !==
      canonicalizeReaderSummaryWeeklyJson(binding.days).json ||
    row.tenantId !== query.tenantId ||
    row.workspaceId !== query.workspaceId ||
    row.scopeType !== query.scope.type ||
    row.scopeKey !== readerSummaryWeeklyScopeKey(query.scope) ||
    rowStartedOn !== query.weekStartedOn ||
    rowEndedOn !== expectedEndedOn ||
    binding.tenantId !== query.tenantId ||
    binding.workspaceId !== query.workspaceId ||
    binding.scopeType !== query.scope.type ||
    binding.scopeKey !== readerSummaryWeeklyScopeKey(query.scope) ||
    binding.weekStartedOn !== query.weekStartedOn ||
    binding.weekEndedOn !== expectedEndedOn
  ) {
    throw new Error(
      "Reader summary weekly certification seal columns, canonical bytes, identity, or hash diverged",
    );
  }
  return binding;
};

const exactBytes = (value: unknown): Buffer => {
  if (!(value instanceof Uint8Array)) {
    throw new Error("Reader summary weekly certification seal canonical bytes are invalid");
  }
  return Buffer.from(value);
};

const exactDate = (value: unknown, label: string): string => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`Reader summary weekly certification seal ${label} is invalid`);
  }
  return value.toISOString().slice(0, 10);
};

const utcDayAfter = (start: string, offset: number): string =>
  new Date(Date.parse(`${start}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString().slice(0, 10);

const untrustedSeal = (): Error =>
  new Error(
    "Reader summary weekly certification seal was not loaded by this verified Prisma authority",
  );
