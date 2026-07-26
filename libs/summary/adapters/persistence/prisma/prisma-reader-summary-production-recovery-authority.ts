import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import {
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  type PrepareReaderSummaryProductionRecoveryResult,
  type ReaderSummaryProductionRecoveryAuthorityBinding,
  type ReaderSummaryProductionRecoveryAuthorityHandle,
  type ReaderSummaryProductionRecoveryAuthorityPort,
} from "../../../ports/reader-summary-production-recovery-authority.port";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  assertExactKeys,
  assertRequestedDates,
  exactBoundaries,
  exactDate,
  exactIdentity,
  exactRecord,
  exactSha256,
  exactUuid,
  recoveryUuid,
  verifiedProductionRecoveryDays,
  verifiedProductionRecoveryDryRuns,
} from "./prisma-reader-summary-production-recovery-authority-row";
import { runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";

type RecoveryAuthoritySqlRow = Readonly<{
  outcome: string;
  recoveryId: string;
  tenantId: string;
  workspaceId: string;
  identity: string;
  canonicalRecord: unknown;
  canonicalBytes: Uint8Array;
  canonicalSha256: string;
  leaseState: string;
  issuedAt: Date;
  consumedAt: Date | null;
  dryRuns: unknown;
  days: unknown;
}>;

const constructorToken = Object.freeze({});
const loadedAuthorities = new WeakSet<object>();
const authorityBindings =
  new WeakMap<object, ReaderSummaryProductionRecoveryAuthorityBinding>();

class PrismaLoadedReaderSummaryProductionRecoveryAuthority {
  constructor(
    token: object,
    binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  ) {
    if (token !== constructorToken) {
      throw new Error(
        "Reader summary production recovery authority is not publicly constructible",
      );
    }
    const stored = cloneBinding(binding);
    authorityBindings.set(this, stored);
    loadedAuthorities.add(this);
    Object.freeze(this);
  }
}
Object.freeze(
  PrismaLoadedReaderSummaryProductionRecoveryAuthority.prototype,
);

export class PrismaReaderSummaryProductionRecoveryAuthority
  implements ReaderSummaryProductionRecoveryAuthorityPort
{
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async prepare(): Promise<PrepareReaderSummaryProductionRecoveryResult> {
    const rows = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(this.prisma, (prisma) =>
        prisma.$queryRaw<readonly RecoveryAuthoritySqlRow[]>`
          SELECT
            "outcome",
            "recovery_id"::text AS "recoveryId",
            "tenant_id"::text AS "tenantId",
            "workspace_id"::text AS "workspaceId",
            "identity",
            "canonical_record" AS "canonicalRecord",
            "canonical_bytes" AS "canonicalBytes",
            "canonical_sha256" AS "canonicalSha256",
            "lease_state" AS "leaseState",
            "issued_at" AS "issuedAt",
            "consumed_at" AS "consumedAt",
            "dry_runs" AS "dryRuns",
            "days"
          FROM "prepare_reader_summary_production_recovery"()
        `,
      ),
    );
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error(
        "PostgreSQL production recovery authority returned no unique result",
      );
    }
    const row = rows[0];
    if (row.outcome !== "prepared" && row.outcome !== "replayed") {
      throw new Error(
        "PostgreSQL production recovery authority returned an invalid outcome",
      );
    }
    return {
      outcome: row.outcome,
      authority: createAuthority(verifiedBinding(row)),
    };
  }

  readVerifiedBinding(
    authority: ReaderSummaryProductionRecoveryAuthorityHandle,
  ): ReaderSummaryProductionRecoveryAuthorityBinding {
    if (typeof authority !== "object" || authority === null) {
      throw untrustedAuthorityError();
    }
    const candidate = authority as unknown as object;
    const binding = authorityBindings.get(candidate);
    if (!loadedAuthorities.has(candidate) || binding === undefined) {
      throw untrustedAuthorityError();
    }
    return cloneBinding(binding);
  }
}

const verifiedBinding = (
  row: RecoveryAuthoritySqlRow,
): ReaderSummaryProductionRecoveryAuthorityBinding => {
  const recoveryId = exactUuid(row.recoveryId, "recovery id");
  const tenantId = exactUuid(row.tenantId, "tenant id");
  const workspaceId = exactUuid(row.workspaceId, "workspace id");
  const identity = exactIdentity(row.identity, "recovery identity");
  const identitySha256 = canonicalizeReaderSummaryWeeklyJson(
    {
      schemaVersion:
        "reader_summary.production_recovery_identity.v1",
      tenantId,
      workspaceId,
      requestedUtcDates: ["2026-07-23", "2026-07-24"],
    },
    "production recovery identity",
  ).sha256;
  const canonicalSha256 = exactSha256(
    row.canonicalSha256,
    "recovery canonical hash",
  );
  const canonicalRecord = exactRecord(
    row.canonicalRecord,
    "recovery canonical record",
  );
  assertExactKeys(
    canonicalRecord,
    [
      "schemaVersion",
      "recoveryId",
      "identity",
      "tenantId",
      "workspaceId",
      "requestedUtcDates",
      "boundaries",
      "days",
    ],
    "recovery canonical record",
  );
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    canonicalRecord,
    "production recovery authority",
  );
  if (
    !(row.canonicalBytes instanceof Uint8Array) ||
    Buffer.from(row.canonicalBytes).compare(
      Buffer.from(canonical.toBytes()),
    ) !== 0 ||
    canonical.sha256 !== canonicalSha256 ||
    canonicalRecord.schemaVersion !==
      "reader_summary.production_recovery_authority.v1" ||
    canonicalRecord.recoveryId !== recoveryId ||
    canonicalRecord.identity !== identity ||
    canonicalRecord.tenantId !== tenantId ||
    canonicalRecord.workspaceId !== workspaceId ||
    identity !==
      `reader_summary.production_recovery.v1:${identitySha256}` ||
    recoveryId !== recoveryUuid(identitySha256)
  ) {
    throw new Error(
      "Reader summary production recovery canonical authority diverged",
    );
  }
  assertRequestedDates(canonicalRecord.requestedUtcDates);
  const boundaries = exactBoundaries(canonicalRecord.boundaries);
  if (row.leaseState !== "CONSUMED" || row.consumedAt === null) {
    throw new Error(
      "Reader summary production recovery pre-model lease was not consumed",
    );
  }
  const issuedAt = exactDate(row.issuedAt, "lease issued timestamp");
  const consumedAt = exactDate(
    row.consumedAt,
    "lease consumed timestamp",
  );
  if (Date.parse(consumedAt) < Date.parse(issuedAt)) {
    throw new Error(
      "Reader summary production recovery lease chronology diverged",
    );
  }
  const dryRunCanonicalSha256s = verifiedProductionRecoveryDryRuns(
    row.dryRuns,
    canonicalSha256,
  );
  const days = verifiedProductionRecoveryDays({
    input: row.days,
    canonicalRecord,
    recoveryId,
    tenantId,
    workspaceId,
  });
  if (
    days[0].githubEvidence.mode !== "historical_unavailable" ||
    days[0].githubEvidence.authorization.authorizedAt !== issuedAt
  ) {
    throw new Error(
      "Reader summary production recovery historical GitHub authorization diverged",
    );
  }
  return deepFreezeReaderSummaryWeekly({
    schemaVersion:
      "reader_summary.production_recovery_authority.v1" as const,
    recoveryId,
    identity,
    tenantId,
    workspaceId,
    requestedUtcDates: ["2026-07-23", "2026-07-24"] as const,
    canonicalSha256,
    dryRunCanonicalSha256s,
    lease: {
      state: "CONSUMED" as const,
      issuedAt,
      consumedAt,
    },
    boundaries,
    days,
  });
};

const createAuthority = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): ReaderSummaryProductionRecoveryAuthorityHandle =>
  new PrismaLoadedReaderSummaryProductionRecoveryAuthority(
    constructorToken,
    binding,
  ) as unknown as ReaderSummaryProductionRecoveryAuthorityHandle;

const cloneBinding = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): ReaderSummaryProductionRecoveryAuthorityBinding =>
  deepFreezeReaderSummaryWeekly(
    JSON.parse(JSON.stringify(binding)) as
      ReaderSummaryProductionRecoveryAuthorityBinding,
  );

const untrustedAuthorityError = (): Error =>
  new Error(
    "Reader summary production recovery authority was not loaded by verified Prisma evidence",
  );
