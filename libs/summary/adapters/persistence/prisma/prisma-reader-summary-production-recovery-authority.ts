import { createHash } from "node:crypto";
import { withPrismaWriteRetry } from "../../../../platform/persistence/src/write-retry";

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
import {
  lockProductionRecoveryRows,
} from "./prisma-reader-summary-production-recovery-authority-row-locks";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
} from "./prisma-summary-transaction";

type PersistedAuthorityRow = Readonly<{
  requestHash: string;
  responsePayload: unknown;
}>;

type PersistedRow = Readonly<{ persisted: boolean }>;
type FinalizedRow = Readonly<{ finalizedCount: number }>;

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
              date_trunc(
                'milliseconds',
                transaction_timestamp()
              ) AS "issuedAt"
            WHERE current_setting('transaction_isolation') = 'serializable'
              AND current_setting('transaction_read_only') = 'off'
              AND current_setting('social_monitor.system_access') = 'false'
          `;
          if (scopeRows.length !== 1 || scopeRows[0] === undefined) {
            throw new Error(
              "Reader summary production recovery requires an exact writable SERIALIZABLE tenant session",
            );
          }
          await lockProductionRecoveryRows(prisma);
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
          const persisted = await prisma.$queryRaw<readonly PersistedRow[]>`
            SELECT
              "persist_reader_summary_production_recovery_v2"(
                ${JSON.stringify(first)}::jsonb
              ) AS "persisted"
          `;
          if (persisted.length !== 1 || persisted[0]?.persisted !== true) {
            throw new Error(
              "Reader summary production recovery authority persistence failed",
            );
          }
          return { binding: first, outcome: "prepared" as const };
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
    WITH target AS (
      SELECT
        lease."id",
        lease."tenant_id",
        lease."workspace_id",
        lease."identity",
        lease."state",
        lease."canonical_record",
        lease."canonical_sha256",
        lease."issued_at",
        lease."consumed_at"
      FROM "reader_summary_production_recovery_leases" AS lease
      WHERE lease."tenant_id" =
          current_setting('social_monitor.tenant_id')::uuid
        AND lease."workspace_id" =
          current_setting('social_monitor.workspace_id')::uuid
        AND lease."canonical_record"->>'schemaVersion' =
          'reader_summary.production_recovery_authority.v2'
        AND lease."canonical_record"->'requestedUtcDates' =
          '[
            "2026-07-23",
            "2026-07-24",
            "2026-07-25",
            "2026-07-26",
            "2026-07-27",
            "2026-07-28"
          ]'::jsonb
      ORDER BY lease."id"
    )
    SELECT
      btrim(lease."canonical_sha256") AS "requestHash",
      jsonb_build_object(
        'schemaVersion',
          'reader_summary.production_recovery_authority.v2',
        'recoveryId', lease."id"::TEXT,
        'identity', lease."identity",
        'tenantId', lease."tenant_id"::TEXT,
        'workspaceId', lease."workspace_id"::TEXT,
        'requestedUtcDates',
          lease."canonical_record"->'requestedUtcDates',
        'canonicalSha256', btrim(lease."canonical_sha256"),
        'dryRunCanonicalSha256s', (
          SELECT jsonb_agg(
            btrim(dry."canonical_sha256")
            ORDER BY dry."ordinal"
          )
          FROM "reader_summary_production_recovery_dry_runs" AS dry
          WHERE dry."recovery_id" = lease."id"
            AND dry."tenant_id" = lease."tenant_id"
            AND dry."workspace_id" = lease."workspace_id"
        ),
        'lease', jsonb_build_object(
          'state', lease."state",
          'issuedAt', to_char(
            lease."issued_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'consumedAt', to_char(
            lease."consumed_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ),
        'boundaries', lease."canonical_record"->'boundaries',
        'days', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'schemaVersion',
                day."canonical_record"->>'schemaVersion',
              'identity', day."identity",
              'requestedUtcDate',
                to_char(day."requested_utc_date", 'YYYY-MM-DD'),
              'period', day."canonical_record"->'period',
              'providerCounts', day."provider_counts",
              'providerEvidence', day."provider_evidence",
              'providerEvidenceSha256',
                btrim(day."provider_evidence_sha256"),
              'githubEvidence', day."github_evidence",
              'canonicalSha256', btrim(day."canonical_sha256"),
              'planSha256s', plan.entry->'planSha256s'
            )
            ORDER BY day."requested_utc_date"
          )
          FROM "reader_summary_production_recovery_days" AS day
          JOIN LATERAL (
            SELECT entry
            FROM jsonb_array_elements(
              lease."canonical_record"->'days'
            ) AS planned(entry)
            WHERE entry->>'requestedUtcDate' =
              to_char(day."requested_utc_date", 'YYYY-MM-DD')
          ) AS plan ON TRUE
          WHERE day."recovery_id" = lease."id"
            AND day."tenant_id" = lease."tenant_id"
            AND day."workspace_id" = lease."workspace_id"
        )
      ) AS "responsePayload"
    FROM target AS lease
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
      LEFT(
        COALESCE(NULLIF(feed."body_preview", ''), source."body"),
        4096
      ) AS "sourceText",
      feed."author_handle" AS "authorHandle",
      source."content_hash" AS "sourceContentHash",
      source."provider_content_hash" AS "sourceProviderContentHash",
      feed."published_at" AS "publishedAt",
      feed."observed_at" AS "observedAt",
      COALESCE(github."result_id"::TEXT, metadata_github."proof_id"::TEXT) AS "githubResultId",
      COALESCE(github."scan_job_id"::TEXT, metadata_github."scan_job_id") AS "githubScanJobId",
      COALESCE(github."attempt_number", metadata_github."proof_version") AS "githubAttemptNumber",
      COALESCE(github."repository_identity", metadata_github."repository_identity") AS "githubRepositoryIdentity",
      COALESCE(github."rank", metadata_github."rank") AS "githubRank",
      COALESCE(github."checked_at", metadata_github."checked_at") AS "githubCheckedAt"
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
    LEFT JOIN LATERAL (
      SELECT
        source."id" AS "proof_id", proof."scan_job_id", 1 AS "proof_version",
        proof."repository_identity", proof."rank", proof."checked_at"
      FROM (
        SELECT
          source."metadata"->'trending'->>'scanJobId' AS "scan_job_id",
          source."metadata"->'repository'->>'fullName' AS "repository_identity",
          source."metadata"->'repository'->>'url' AS "repository_url",
          source."metadata"->'trending'->>'window' AS "window",
          CASE WHEN source."metadata"->'trending'->>'rank' ~ '^[1-9][0-9]{0,8}$'
            THEN (source."metadata"->'trending'->>'rank')::INTEGER
            ELSE NULL END AS "rank",
          CASE
            WHEN source."metadata"->'trending'->>'checkedAt' ~
                '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$'
              THEN (source."metadata"->'trending'->>'checkedAt')::TIMESTAMPTZ
            ELSE NULL END AS "checked_at"
      ) AS proof
      WHERE github."result_id" IS NULL
        AND feed."provider_key" = 'github-trending-page'
        AND source."metadata"->>'kind' = 'github_trending_page_repository'
        AND proof."scan_job_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND proof."repository_identity" ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
        AND proof."repository_url" = source."canonical_url"
        AND lower(proof."repository_url") = lower(
          'https://github.com/' || proof."repository_identity")
        AND proof."window" IN ('daily', 'today')
        AND source."provider_item_id" = 'github-trending-page:' ||
          proof."window" || ':' || proof."scan_job_id" || ':' ||
          proof."repository_identity"
        AND proof."rank" IS NOT NULL
        AND proof."checked_at" IS NOT NULL
        AND to_char(proof."checked_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD') = to_char(feed."published_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD')
    ) AS metadata_github ON TRUE
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
        (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
      AND feed."published_at" <
        (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC')
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
