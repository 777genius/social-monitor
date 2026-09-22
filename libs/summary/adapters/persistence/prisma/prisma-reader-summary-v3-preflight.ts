import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import { createHash } from "node:crypto";

import type {
  ReaderSummaryV3PreflightOutcome,
  ReaderSummaryV3PreflightPort,
  ReaderSummaryV3PreparationSourcePort,
} from "../../../ports";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type { PrismaReaderSummaryJobRepository } from
  "./prisma-reader-summary-job.repository";
import { requireSerializableReaderSummaryTransactions,
  runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";
import { assessmentStatesMatchManifest, type ReaderSummaryAssessmentState,
  uniqueAssessmentIds } from "./prisma-reader-summary-v3-readiness";

type LockedJob = {
  readonly status: string;
  readonly selection_strategy: string | null;
  readonly preparation_manifest: unknown | null;
  readonly preparation_config: unknown | null;
  readonly preparation_manifest_sha256: string | null;
  readonly preparation_deadline_at: string | null;
  readonly started_at: Date | null;
  readonly terminal_failure_code: string | null;
};

export class PrismaReaderSummaryV3Preflight implements ReaderSummaryV3PreflightPort {
  constructor(
    private readonly prisma: PrismaSummaryClient,
    private readonly jobs: PrismaReaderSummaryJobRepository,
    private readonly source: ReaderSummaryV3PreparationSourcePort,
  ) { requireSerializableReaderSummaryTransactions(prisma); }

  async advance(
    params: Parameters<ReaderSummaryV3PreflightPort["advance"]>[0],
  ): Promise<ReaderSummaryV3PreflightOutcome> {
    let job = await this.find(params.job) ?? params.job;
    let snapshot = job.toSnapshot();
    if (snapshot.status === "running") return { kind: "already_running", job };
    if (snapshot.status !== "requested") return { kind: "terminal", job };

    if (snapshot.preparationConfig === undefined) {
      // Freeze exact config and clocks before the inventory walk. Retries and
      // competing preparers must use the identity selected by this CAS.
      const configured = await this.source.configuration(job);
      if (!configured.ok) return this.fail(job, configured.code, params, true);
      await withPrismaWriteRetry(() => runSerializableReaderSummaryTransaction(
        this.prisma,
        async (tx) => {
          const rows = await lockJob(tx, snapshot);
          const row = rows[0];
          if (row?.status !== "REQUESTED") return;
          if (row.selection_strategy !== "jev_primary_v3") {
            throw new Error("Reader summary V3 strategy changed");
          }
          await tx.$queryRaw`
            UPDATE reader_summary_jobs SET
              preparation_config=${JSON.stringify(configured.config)}::jsonb,
              preparation_cutoff_at=COALESCE(preparation_cutoff_at, requested_at),
              preparation_deadline_at=COALESCE(preparation_deadline_at,
                clock_timestamp() + interval '15 minutes'),
              preparation_next_check_at=LEAST(
                COALESCE(preparation_deadline_at,
                  clock_timestamp() + interval '15 minutes'),
                clock_timestamp() + interval '10 seconds')
            WHERE tenant_id=${snapshot.tenantId}::uuid
              AND workspace_id=${snapshot.workspaceId}::uuid
              AND id=${snapshot.id}::uuid AND status='REQUESTED'
              AND preparation_config IS NULL
            RETURNING id
          `;
        },
      ));
      job = await this.find(job) ?? job;
      snapshot = job.toSnapshot();
      if (snapshot.status === "running") return { kind: "already_running", job };
      if (snapshot.status !== "requested") return { kind: "terminal", job };
    }
    if (snapshot.preparationManifest === undefined) {
      const frozenConfig = snapshot.preparationConfig;
      if (frozenConfig === undefined) {
        return this.fail(job, "config_unavailable", params);
      }
      const prepared = await this.source.prepare(job, frozenConfig);
      if (!prepared.ok) return this.fail(job, prepared.code, params);
      if (!samePreparationIdentity(frozenConfig, prepared.config, prepared.manifest)) {
        return this.fail(job, "config_unavailable", params);
      }
      await withPrismaWriteRetry(() => runSerializableReaderSummaryTransaction(
        this.prisma,
        async (tx) => {
          const rows = await lockJob(tx, snapshot);
          const row = rows[0];
          if (row?.status !== "REQUESTED") return;
          if (row.selection_strategy !== "jev_primary_v3") {
            throw new Error("Reader summary V3 strategy changed");
          }
          if (row.preparation_manifest_sha256 === null) {
            await tx.$queryRaw`
              UPDATE reader_summary_jobs SET
                preparation_manifest=${JSON.stringify(prepared.manifest)}::jsonb,
                preparation_manifest_sha256=${prepared.manifestSha256},
                preparation_next_check_at=LEAST(
                  preparation_deadline_at,
                  clock_timestamp() + interval '10 seconds')
              WHERE tenant_id=${snapshot.tenantId}::uuid
                AND workspace_id=${snapshot.workspaceId}::uuid
                AND id=${snapshot.id}::uuid AND status='REQUESTED'
                AND preparation_config=${JSON.stringify(frozenConfig)}::jsonb
              RETURNING id
            `;
          }
        },
      ));
      job = await this.find(job) ?? job;
      snapshot = job.toSnapshot();
      if (snapshot.status === "running") return { kind: "already_running", job };
      if (snapshot.status !== "requested") return { kind: "terminal", job };
    }
    const manifest = snapshot.preparationManifest;
    if (manifest === undefined) return this.fail(job, "config_unavailable", params);

    const decision = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(this.prisma, async (tx) => {
        const rows = await lockJob(tx, snapshot);
        const row = rows[0];
        if (row === undefined) return "terminal" as const;
        if (row.status === "RUNNING") return "running" as const;
        if (row.status !== "REQUESTED") return "terminal" as const;
        const deadlineText = row.preparation_deadline_at;
        if (deadlineText === null) return fail(tx, snapshot, "config_unavailable");
        const live = await livePreparationScope(tx, snapshot, row.preparation_config,
          manifest.candidates.map((candidate) => candidate.candidateId));
        if (live !== "live") return fail(tx, snapshot, live);
        const ids = uniqueAssessmentIds(manifest);
        const states = ids.length === 0 ? [] : await tx.$queryRaw<readonly ReaderSummaryAssessmentState[]>`
          SELECT a.id::text, a.state,
            (a.assessed_at IS NOT NULL AND
              a.assessed_at <= ${deadlineText}::timestamptz) AS accepted_on_time,
            btrim(a.source_snapshot_sha256) AS source_snapshot_sha256,
            btrim(a.input_sha256) AS input_sha256,
            btrim(a.rubric_sha256) AS rubric_sha256, a.model_config_version
          FROM reader_value_assessments a
          WHERE a.tenant_id=${snapshot.tenantId}::uuid
            AND a.workspace_id=${snapshot.workspaceId}::uuid
            AND a.id=ANY(${ids}::uuid[]) ORDER BY a.id FOR KEY SHARE OF a
        `;
        if (!assessmentStatesMatchManifest(manifest, states)) {
          return fail(tx, snapshot, "assessment_unavailable");
        }
        const ready = states.every((state) => state.state === "assessed" &&
          state.accepted_on_time);
        if (ready) {
          await tx.$queryRaw`
            UPDATE reader_summary_jobs SET status='RUNNING',
              preparation_ready_at=clock_timestamp(),
              started_at=date_trunc('milliseconds', clock_timestamp()),
              preparation_next_check_at=NULL, failed_at=NULL, failure_reason=NULL
            WHERE tenant_id=${snapshot.tenantId}::uuid
              AND workspace_id=${snapshot.workspaceId}::uuid
              AND id=${snapshot.id}::uuid AND status='REQUESTED'
            RETURNING id
          `;
          return "claimed" as const;
        }
        const wall = await tx.$queryRaw<readonly { readonly expired: boolean }[]>`
          SELECT clock_timestamp() >= ${deadlineText}::timestamptz AS expired
        `;
        if (wall[0]?.expired === true) {
          return fail(tx, snapshot, "assessment_coverage_timeout");
        }
        await tx.$queryRaw`
          UPDATE reader_summary_jobs SET preparation_next_check_at=LEAST(
            ${deadlineText}::timestamptz, clock_timestamp()+interval '10 seconds')
          WHERE tenant_id=${snapshot.tenantId}::uuid
            AND workspace_id=${snapshot.workspaceId}::uuid
            AND id=${snapshot.id}::uuid AND status='REQUESTED' RETURNING id
        `;
        return "deferred" as const;
      }));
    const current = await this.find(job) ?? job;
    if (decision === "claimed") return { kind: "claimed", job: current, manifest };
    const currentStatus = current.toSnapshot().status;
    if (currentStatus === "running") return { kind: "already_running", job: current };
    if (currentStatus !== "requested") return { kind: "terminal", job: current };
    if (decision === "deferred") return { kind: "deferred", job: current };
    if (decision === "running") return { kind: "already_running", job: current };
    return { kind: "terminal", job: current };
  }

  private async fail(job: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0],
    code: "assessment_snapshot_unavailable" | "assessment_inventory_over_budget" |
      "config_unavailable",
    params: Parameters<ReaderSummaryV3PreflightPort["advance"]>[0],
    unconfiguredOnly = false,
  ): Promise<ReaderSummaryV3PreflightOutcome> {
    const snapshot = job.toSnapshot();
    await withPrismaWriteRetry(() => runSerializableReaderSummaryTransaction(
      this.prisma, async (tx) => {
        const rows = await lockJob(tx, snapshot);
        if (rows[0]?.status !== "REQUESTED" ||
            rows[0]?.preparation_manifest !== null ||
            (unconfiguredOnly && rows[0]?.preparation_config !== null)) return;
        await fail(tx, snapshot, code);
      }));
    const current = await this.find(job) ?? job;
    const currentSnapshot = current.toSnapshot();
    if (currentSnapshot.status === "running") {
      return { kind: "already_running", job: current };
    }
    if (currentSnapshot.status === "requested" &&
        (currentSnapshot.preparationManifest !== undefined ||
          (unconfiguredOnly && currentSnapshot.preparationConfig !== undefined))) {
      return this.advance({ ...params, job: current });
    }
    return { kind: "terminal", job: current };
  }

  private find(job: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0]) {
    const snapshot = job.toSnapshot();
    return this.jobs.findById({ tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId, readerSummaryJobId: snapshot.id });
  }
}

const lockJob = (tx: Pick<PrismaReaderSummaryClient, "$queryRaw">, snapshot: ReturnType<
  Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0]["toSnapshot"]>,
) => tx.$queryRaw<readonly LockedJob[]>`
  SELECT status, selection_strategy, preparation_manifest, preparation_config,
    preparation_manifest_sha256,
    CASE WHEN preparation_deadline_at IS NULL THEN NULL ELSE
      to_char(preparation_deadline_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS preparation_deadline_at,
    started_at,
    terminal_failure_code FROM reader_summary_jobs
  WHERE tenant_id=${snapshot.tenantId}::uuid
    AND workspace_id=${snapshot.workspaceId}::uuid AND id=${snapshot.id}::uuid
  FOR UPDATE
`;

const fail = async (
  tx: Pick<PrismaReaderSummaryClient, "$queryRaw">,
  snapshot: ReturnType<Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0]["toSnapshot"]>,
  code: string,
): Promise<"terminal"> => {
  await tx.$queryRaw`
    UPDATE reader_summary_jobs SET status='FAILED', failed_at=clock_timestamp(),
      failure_reason=${code}, terminal_failure_code=${code},
      preparation_next_check_at=NULL
    WHERE tenant_id=${snapshot.tenantId}::uuid
      AND workspace_id=${snapshot.workspaceId}::uuid
      AND id=${snapshot.id}::uuid AND status='REQUESTED' RETURNING id
  `;
  return "terminal";
};

const livePreparationScope = async (
  tx: Pick<PrismaReaderSummaryClient, "$queryRaw">,
  snapshot: ReturnType<Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0]["toSnapshot"]>,
  rawConfig: unknown,
  candidateIds: readonly string[],
): Promise<"live" | "scope_changed" | "interest_changed" | "config_unavailable"> => {
  if (rawConfig === null || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return "config_unavailable";
  }
  const config = rawConfig as Record<string, unknown>;
  if (typeof config.interestId !== "string" ||
      typeof config.interestSha256 !== "string") return "config_unavailable";
  const workspace = await tx.$queryRaw<readonly { readonly live: boolean }[]>`
    SELECT (w.deleted_at IS NULL AND t.deleted_at IS NULL) AS live
    FROM workspaces w JOIN tenants t ON t.id=w.tenant_id
    WHERE w.tenant_id=${snapshot.tenantId}::uuid AND w.id=${snapshot.workspaceId}::uuid
    -- This is the short final ready-claim transaction, not model work. An
    -- no-key update lock makes scope deletion and non-key visibility changes wait,
    -- rather than allowing a prepared job to claim a revoked scope.
    FOR NO KEY UPDATE OF w,t
  `;
  if (workspace.length !== 1 || workspace[0]?.live !== true) return "scope_changed";
  const interests = await tx.$queryRaw<readonly { readonly query: string;
    readonly status: string; readonly deleted_at: Date | null }[]>`
    SELECT query,status,deleted_at FROM interests
    WHERE tenant_id=${snapshot.tenantId}::uuid
      AND workspace_id=${snapshot.workspaceId}::uuid
      AND id=${config.interestId}::uuid FOR NO KEY UPDATE
  `;
  const interest = interests[0];
  if (interest === undefined || interest.deleted_at !== null ||
      interest.status !== 'ENABLED' || sha256(interest.query) !== config.interestSha256) {
    return "interest_changed";
  }
  if (candidateIds.length === 0) return "live";
  const visible = await tx.$queryRaw<readonly { readonly id: string }[]>`
    SELECT f.id::text AS id FROM feed_items f JOIN source_items s
      ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id
        AND s.id=f.source_item_id AND s.provider_key=f.provider_key
    JOIN source_bindings b ON b.tenant_id=f.tenant_id
      AND b.workspace_id=f.workspace_id AND b.id=f.source_binding_id
      AND b.interest_id=f.interest_id AND b.status='ENABLED' AND b.deleted_at IS NULL
    JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id
      AND c.provider_key=f.provider_key
    WHERE f.tenant_id=${snapshot.tenantId}::uuid
      AND f.workspace_id=${snapshot.workspaceId}::uuid
      AND f.interest_id=${config.interestId}::uuid
      AND f.id=ANY(${candidateIds}::uuid[]) AND f.status='VISIBLE'
      AND COALESCE(s.metadata->>'deleted','false') <> 'true'
      AND COALESCE(s.metadata->>'dead','false') <> 'true'
      AND COALESCE(s.metadata->>'banned','false') <> 'true'
      AND NOT EXISTS (SELECT 1 FROM feed_items revoked
        WHERE revoked.tenant_id=f.tenant_id AND revoked.workspace_id=f.workspace_id
          AND revoked.interest_id=f.interest_id AND revoked.source_item_id=f.source_item_id
          AND revoked.status='TOMBSTONED')
    -- The ready claim freezes the same visibility facts as final publication.
    -- FOR NO KEY UPDATE conflicts with status, tombstone and metadata revocations;
    -- deterministic candidate order prevents inverted multi-row lock order.
    ORDER BY f.id FOR NO KEY UPDATE OF f,s,b
  `;
  return visible.length === candidateIds.length ? "live" : "scope_changed";
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const samePreparationIdentity = (
  frozen: NonNullable<ReturnType<Parameters<
    ReaderSummaryV3PreparationSourcePort["prepare"]>[0]["toSnapshot"]>["preparationConfig"]>,
  prepared: typeof frozen,
  manifest: NonNullable<ReturnType<Parameters<
    ReaderSummaryV3PreparationSourcePort["prepare"]>[0]["toSnapshot"]>["preparationManifest"]>,
): boolean => frozen.schemaVersion === prepared.schemaVersion &&
  frozen.interestId === prepared.interestId &&
  frozen.interestSha256 === prepared.interestSha256 &&
  frozen.rubricVersion === prepared.rubricVersion &&
  frozen.rubricSha256 === prepared.rubricSha256 &&
  frozen.inputBuilderVersion === prepared.inputBuilderVersion &&
  frozen.modelConfigVersion === prepared.modelConfigVersion &&
  manifest.interestSha256 === frozen.interestSha256 &&
  manifest.rubricSha256 === frozen.rubricSha256 &&
  manifest.inputBuilderVersion === frozen.inputBuilderVersion &&
  manifest.modelConfigVersion === frozen.modelConfigVersion;
