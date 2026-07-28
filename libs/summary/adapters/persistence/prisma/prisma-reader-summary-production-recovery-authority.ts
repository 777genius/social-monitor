import { createHash } from "node:crypto";

import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import {
  type PrepareReaderSummaryProductionRecoveryResult,
  type ReaderSummaryProductionRecoveryAuthorityBinding,
  type ReaderSummaryProductionRecoveryAuthorityHandle,
  type ReaderSummaryProductionRecoveryAuthorityPort,
} from "../../../ports/reader-summary-production-recovery-authority.port";
import {
  buildProductionRecoveryAuthorityBinding,
  type ProductionRecoveryEvidenceRow,
  type ProductionRecoveryScopeRow,
  verifyPersistedProductionRecoveryAuthority,
} from "./prisma-reader-summary-production-recovery-authority-row";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
} from "./prisma-summary-transaction";

type PersistedAuthorityRow = Readonly<{
  requestHash: string;
  responsePayload: unknown;
}>;

type InsertedRow = Readonly<{ inserted: boolean }>;
type FinalizedRow = Readonly<{ finalizedCount: number }>;

const authorityScope = "reader-summary-production-recovery-authority-v2";
const authorityKey = "2026-07-24..2026-07-27";
const constructorToken = Object.freeze({});
const loadedAuthorities = new WeakSet<object>();
const authorityBindings =
  new WeakMap<object, ReaderSummaryProductionRecoveryAuthorityBinding>();
const transactionOptions: PrismaSummaryTransactionOptions = Object.freeze({
  maxWait: 30_000,
  timeout: 300_000,
});

class LoadedProductionRecoveryAuthority {
  constructor(
    token: object,
    binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  ) {
    if (token !== constructorToken) {
      throw new Error(
        "Reader summary production recovery authority is not publicly constructible",
      );
    }
    authorityBindings.set(this, binding);
    loadedAuthorities.add(this);
    Object.freeze(this);
  }
}
Object.freeze(LoadedProductionRecoveryAuthority.prototype);

export class PrismaReaderSummaryProductionRecoveryAuthority
  implements ReaderSummaryProductionRecoveryAuthorityPort
{
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async prepare(): Promise<PrepareReaderSummaryProductionRecoveryResult> {
    const prepared = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.prisma,
        async (prisma) => {
          const existing = await readPersistedAuthority(prisma);
          if (existing !== undefined) {
            return {
              binding: existing,
              outcome: (await allDaysFinalized(prisma, existing))
                ? ("replayed" as const)
                : ("prepared" as const),
            };
          }
          const scopeRows = await prisma.$queryRaw<
            readonly ProductionRecoveryScopeRow[]
          >`
            SELECT
              current_setting('social_monitor.tenant_id')::TEXT AS "tenantId",
              current_setting('social_monitor.workspace_id')::TEXT AS "workspaceId",
              transaction_timestamp() AS "issuedAt"
            WHERE current_setting('transaction_isolation') = 'serializable'
              AND current_setting('transaction_read_only') = 'off'
              AND current_setting('social_monitor.system_access') = 'false'
          `;
          if (scopeRows.length !== 1 || scopeRows[0] === undefined) {
            throw new Error(
              "Reader summary production recovery requires an exact writable SERIALIZABLE tenant session",
            );
          }
          const firstRows = await readEvidence(prisma);
          const secondRows = await readEvidence(prisma);
          const first = buildProductionRecoveryAuthorityBinding({
            scope: scopeRows[0],
            rows: firstRows,
          });
          const second = buildProductionRecoveryAuthorityBinding({
            scope: scopeRows[0],
            rows: secondRows,
          });
          if (
            first.canonicalSha256 !== second.canonicalSha256 ||
            JSON.stringify(first) !== JSON.stringify(second) ||
            first.days.some(
              (day, index) =>
                day.planSha256s[0] !== day.planSha256s[1] ||
                day.canonicalSha256 !==
                  second.days[index]?.canonicalSha256,
            )
          ) {
            throw new Error(
              "Reader summary production recovery two-pass plan hashes diverged",
            );
          }
          const serialized = JSON.stringify(first);
          const inserted = await prisma.$queryRaw<readonly InsertedRow[]>`
            INSERT INTO "idempotency_keys" (
              "id", "tenant_id", "workspace_id", "scope", "key",
              "request_hash", "response_status", "response_payload",
              "expires_at", "created_at"
            ) VALUES (
              ${first.recoveryId}::uuid,
              ${first.tenantId}::uuid,
              ${first.workspaceId}::uuid,
              ${authorityScope},
              ${authorityKey},
              ${first.canonicalSha256},
              102,
              ${serialized}::jsonb,
              NULL,
              ${new Date(first.lease.issuedAt)}
            )
            ON CONFLICT ("tenant_id", "workspace_id", "scope", "key")
            DO NOTHING
            RETURNING TRUE AS "inserted"
          `;
          if (inserted.length === 1) {
            return { binding: first, outcome: "prepared" as const };
          }
          const concurrent = await readPersistedAuthority(prisma);
          if (concurrent === undefined) {
            throw serializationConflict(
              "Reader summary production recovery concurrent authority requires a fresh snapshot",
            );
          }
          if (concurrent.canonicalSha256 !== first.canonicalSha256) {
            throw new Error(
              "Reader summary production recovery concurrent authority diverged",
            );
          }
          return {
            binding: concurrent,
            outcome: (await allDaysFinalized(prisma, concurrent))
              ? ("replayed" as const)
              : ("prepared" as const),
          };
        },
        transactionOptions,
      ),
    );
    return {
      outcome: prepared.outcome,
      authority: new LoadedProductionRecoveryAuthority(
        constructorToken,
        prepared.binding,
      ) as unknown as ReaderSummaryProductionRecoveryAuthorityHandle,
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
    return binding;
  }
}

const readPersistedAuthority = async (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
): Promise<ReaderSummaryProductionRecoveryAuthorityBinding | undefined> => {
  const rows = await prisma.$queryRaw<readonly PersistedAuthorityRow[]>`
    SELECT
      "request_hash" AS "requestHash",
      "response_payload" AS "responsePayload"
    FROM "idempotency_keys"
    WHERE "tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND "workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND "scope" = ${authorityScope}
      AND "key" = ${authorityKey}
    FOR SHARE
  `;
  if (rows.length > 1) {
    throw new Error(
      "Reader summary production recovery persisted authority is ambiguous",
    );
  }
  const row = rows[0];
  return row === undefined
    ? undefined
    : verifyPersistedProductionRecoveryAuthority(
        row.responsePayload,
        row.requestHash,
      );
};

const readEvidence = (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
): Promise<readonly ProductionRecoveryEvidenceRow[]> =>
  prisma.$queryRaw<readonly ProductionRecoveryEvidenceRow[]>`
    SELECT
      to_char(
        feed."published_at" AT TIME ZONE 'UTC',
        'YYYY-MM-DD'
      ) AS "requestedUtcDate",
      feed."provider_key" AS "providerKey",
      feed."id"::TEXT AS "feedItemId",
      source."id"::TEXT AS "sourceItemId",
      source."source_binding_id"::TEXT AS "sourceBindingId",
      feed."interest_id"::TEXT AS "interestId",
      source."provider_item_id" AS "providerItemId",
      source."canonical_url" AS "canonicalUrl",
      feed."title" AS "title",
      feed."body_preview" AS "bodyPreview",
      source."body" AS "sourceText",
      feed."author_handle" AS "authorHandle",
      source."content_hash" AS "sourceContentHash",
      source."provider_content_hash" AS "sourceProviderContentHash",
      feed."published_at" AS "publishedAt",
      feed."observed_at" AS "observedAt",
      github."result_id"::TEXT AS "githubResultId",
      github."scan_job_id"::TEXT AS "githubScanJobId",
      github."attempt_number" AS "githubAttemptNumber",
      github."repository_identity" AS "githubRepositoryIdentity",
      github."rank" AS "githubRank",
      github."checked_at" AS "githubCheckedAt"
    FROM "feed_items" AS feed
    JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
      AND source."tenant_id" = feed."tenant_id"
      AND source."workspace_id" = feed."workspace_id"
      AND source."source_binding_id" = feed."source_binding_id"
      AND source."provider_key" = feed."provider_key"
      AND source."canonical_url" = feed."canonical_url"
    JOIN "source_bindings" AS binding
      ON binding."id" = source."source_binding_id"
      AND binding."tenant_id" = source."tenant_id"
      AND binding."workspace_id" = source."workspace_id"
      AND binding."interest_id" = feed."interest_id"
      AND binding."status" = 'ENABLED'
      AND binding."deleted_at" IS NULL
    JOIN "source_catalog_entries" AS catalog
      ON catalog."id" = binding."source_catalog_entry_id"
      AND catalog."provider_key" = feed."provider_key"
    JOIN "interests" AS interest
      ON interest."id" = binding."interest_id"
      AND interest."tenant_id" = binding."tenant_id"
      AND interest."workspace_id" = binding."workspace_id"
      AND interest."status" = 'ENABLED'
      AND interest."deleted_at" IS NULL
    LEFT JOIN LATERAL (
      SELECT
        result."id" AS "result_id",
        result."scan_job_id",
        attempt."attempt_number",
        result."repository_full_name" AS "repository_identity",
        result."rank",
        result."checked_at"
      FROM "github_repository_trend_results" AS result
      JOIN "scan_jobs" AS scan
        ON scan."id" = result."scan_job_id"
        AND scan."tenant_id" = result."tenant_id"
        AND scan."workspace_id" = result."workspace_id"
        AND scan."source_binding_id" = result."source_binding_id"
        AND scan."status" = 'SUCCEEDED'
      JOIN LATERAL (
        SELECT completed."attempt_number"
        FROM "scan_attempts" AS completed
        WHERE completed."scan_job_id" = scan."id"
          AND completed."tenant_id" = scan."tenant_id"
          AND completed."workspace_id" = scan."workspace_id"
          AND completed."source_binding_id" = scan."source_binding_id"
          AND completed."status" = 'SUCCEEDED'
          AND completed."finished_at" IS NOT NULL
        ORDER BY completed."attempt_number" DESC
        LIMIT 1
      ) AS attempt ON TRUE
      WHERE feed."provider_key" = 'github-trending-page'
        AND result."source_item_id" = source."id"
        AND result."tenant_id" = source."tenant_id"
        AND result."workspace_id" = source."workspace_id"
        AND result."source_binding_id" = source."source_binding_id"
        AND result."repository_url" = source."canonical_url"
        AND result."primary_window" IN ('daily', 'today')
      ORDER BY result."checked_at" DESC, result."id"
      LIMIT 1
    ) AS github ON TRUE
    WHERE feed."tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND feed."workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND feed."status" = 'VISIBLE'
      AND feed."provider_key" = ANY(ARRAY[
        'github-trending-page',
        'hacker-news',
        'reddit',
        'rss',
        'x-twitter'
      ])
      AND feed."published_at" >=
        (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
      AND feed."published_at" <
        (DATE '2026-07-28'::TIMESTAMP AT TIME ZONE 'UTC')
      AND source."content_hash" ~ '^[0-9a-f]{64}$'
      AND (
        source."provider_content_hash" IS NULL
        OR source."provider_content_hash" ~ '^[0-9a-f]{64}$'
      )
    ORDER BY
      "requestedUtcDate",
      array_position(ARRAY[
        'github-trending-page',
        'hacker-news',
        'reddit',
        'rss',
        'x-twitter'
      ], feed."provider_key"),
      feed."id"
  `;

const allDaysFinalized = async (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): Promise<boolean> => {
  const dayProofs = JSON.stringify(
    binding.days.map((day) => ({
      requestedUtcDate: day.requestedUtcDate,
      readerSummaryJobId: recoveryDayUuid(
        binding.recoveryId,
        day.requestedUtcDate,
        "job",
      ),
      readerSummaryArtifactId: recoveryDayUuid(
        binding.recoveryId,
        day.requestedUtcDate,
        "artifact",
      ),
      planSha256: day.canonicalSha256,
    })),
  );
  const rows = await prisma.$queryRaw<readonly FinalizedRow[]>`
    SELECT count(*)::INTEGER AS "finalizedCount"
    FROM jsonb_to_recordset(${dayProofs}::jsonb) AS expected(
      "requestedUtcDate" TEXT,
      "readerSummaryJobId" UUID,
      "readerSummaryArtifactId" UUID,
      "planSha256" TEXT
    )
    JOIN "reader_summary_recovery_receipts" AS receipt
      ON receipt."tenant_id" = ${binding.tenantId}::uuid
      AND receipt."workspace_id" = ${binding.workspaceId}::uuid
      AND receipt."reader_summary_job_id" = expected."readerSummaryJobId"
      AND receipt."reader_summary_artifact_id" =
        expected."readerSummaryArtifactId"
      AND receipt."recovery_kind" = 'SUMMARY_ONLY'
      AND receipt."provenance"->'regenerationInputManifest'->>'sha256' =
        expected."planSha256"
  `;
  return rows[0]?.finalizedCount === binding.days.length;
};

const recoveryDayUuid = (
  recoveryId: string,
  date: string,
  kind: "job" | "artifact",
): string => {
  const hash = createHash("sha256")
    .update(
      `reader-summary-production-recovery-${kind}:${recoveryId}:${date}`,
    )
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const untrustedAuthorityError = (): Error =>
  new Error(
    "Reader summary production recovery authority was not loaded by verified Prisma evidence",
  );

const serializationConflict = (message: string): Error =>
  Object.assign(new Error(message), { code: "40001" });
