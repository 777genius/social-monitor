import type { PoolClient } from "pg";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { createHash } from "node:crypto";

import { PrismaReaderSummaryV3Preflight } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-preflight";
import { PrismaReaderSummaryJobRepository } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import type { PrismaSummaryClient } from
  "../../libs/summary/adapters/persistence/prisma/prisma-summary-client";
import { assertPostgres as assert } from
  "./reader-summary-publication-postgres-assertions";
import { postgresPreflightClient } from "./reader-summary-v3-postgres-preflight-client";

type PreflightFenceScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly jobId: string;
};

export const assertV3PreflightCancellationFence = async (params: {
  readonly client: PoolClient;
  readonly cancellationClient: PoolClient;
  readonly fixture: { readonly jobId: string;
    readonly payload: Readonly<Record<string, unknown>> };
}): Promise<void> => {
  const scope = fixtureScope(params.fixture);
  await resetFixture(params.client, scope);
  const source = await emptyPreparationSource(params.client, scope);
  const prisma = postgresPreflightClient(params.client);
  const jobs = new CancelAfterClaimRepository(prisma, params.cancellationClient,
    scope);
  const job = await jobs.findById({ tenantId: tenantId(scope.tenantId),
    workspaceId: workspaceId(scope.workspaceId), readerSummaryJobId: scope.jobId });
  if (job === null) throw new Error("V3 cancellation-fence fixture job is missing");

  const outcome = await new PrismaReaderSummaryV3Preflight(prisma, jobs, source)
    .advance({ job, requestedAt: job.toSnapshot().requestedAt,
      startedAt: job.toSnapshot().requestedAt });
  const snapshot = outcome.job.toSnapshot();
  assert(jobs.cancellationCommitted,
    "V3 cancellation-fence fixture did not interleave after the claim commit");
  assert(outcome.kind === "terminal" && snapshot.status === "failed" &&
    snapshot.terminalFailureCode === "operator_cancelled",
  `V3 preflight returned ${outcome.kind}/${snapshot.status} after committed cancellation`);
};

const fixtureScope = (fixture: { readonly jobId: string;
  readonly payload: Readonly<Record<string, unknown>> }): PreflightFenceScope => {
  const tenant = fixture.payload.tenantId;
  const workspace = fixture.payload.workspaceId;
  if (typeof tenant !== "string" || typeof workspace !== "string") {
    throw new Error("V3 cancellation-fence fixture scope is missing");
  }
  return { tenantId: tenant, workspaceId: workspace, jobId: fixture.jobId };
};

const resetFixture = async (client: PoolClient, scope: PreflightFenceScope) => {
  const reset = await client.query(`UPDATE reader_summary_jobs SET status='REQUESTED', started_at=NULL,
    completed_at=NULL, failed_at=NULL, reader_summary_artifact_id=NULL,
    failure_reason=NULL, terminal_failure_code=NULL,
    selection_strategy='jev_primary_v3', preparation_config=NULL,
    preparation_manifest=NULL, preparation_manifest_sha256=NULL,
    preparation_cutoff_at=requested_at, preparation_deadline_at=NULL,
    preparation_next_check_at=NULL, preparation_ready_at=NULL
    WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid`,
  [scope.tenantId, scope.workspaceId, scope.jobId]);
  assert(reset.rowCount === 1, "V3 cancellation-fence fixture reset missed its scoped job");
};

const emptyPreparationSource = async (client: PoolClient, scope: PreflightFenceScope) => {
  const row = (await client.query<{ readonly interest_id: string;
    readonly query: string; readonly cutoff_at: string }>(`
      SELECT j.interest_id::text, i.query,
        to_char(j.requested_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff_at
      FROM reader_summary_jobs j JOIN interests i
        ON i.tenant_id=j.tenant_id AND i.workspace_id=j.workspace_id
          AND i.id=j.interest_id
      WHERE j.tenant_id=$1::uuid AND j.workspace_id=$2::uuid AND j.id=$3::uuid`,
    [scope.tenantId, scope.workspaceId, scope.jobId])).rows[0];
  if (row === undefined) throw new Error("V3 cancellation-fence interest is missing");
  const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
    interestId: row.interest_id, interestSha256: sha256(row.query),
    rubricVersion: "reader-value.v1", rubricSha256: "b".repeat(64),
    inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" };
  const manifest = { schemaVersion: "reader_summary_preparation_manifest.v1" as const,
    cutoffAt: row.cutoff_at, interestSha256: config.interestSha256,
    rubricSha256: config.rubricSha256,
    inputBuilderVersion: config.inputBuilderVersion,
    modelConfigVersion: config.modelConfigVersion, candidates: [] };
  return { configuration: async () => ({ ok: true as const, config }),
    prepare: async () => ({ ok: true as const, config, manifest,
      manifestSha256: sha256(JSON.stringify(manifest)) }),
    coverage: async () => ({ status: "ready" as const }) };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

class CancelAfterClaimRepository extends PrismaReaderSummaryJobRepository {
  cancellationCommitted = false;

  constructor(
    prisma: PrismaSummaryClient,
    private readonly cancellationClient: PoolClient,
    private readonly scope: PreflightFenceScope,
  ) { super(prisma); }

  override async findById(
    params: Parameters<PrismaReaderSummaryJobRepository["findById"]>[0],
  ) {
    if (!this.cancellationCommitted && params.readerSummaryJobId === this.scope.jobId) {
      const current = (await this.cancellationClient.query<{ readonly status: string }>(
        `SELECT status::text FROM reader_summary_jobs
          WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid`,
        [this.scope.tenantId, this.scope.workspaceId, this.scope.jobId],
      )).rows[0];
      if (current?.status === "RUNNING") {
        const cancelled = await this.cancellationClient.query(
          `UPDATE reader_summary_jobs SET status='FAILED',
            failed_at=clock_timestamp(),
            failure_reason='Reader summary job cancelled by operator',
            terminal_failure_code='operator_cancelled'
          WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid
            AND status='RUNNING' RETURNING id`,
          [this.scope.tenantId, this.scope.workspaceId, this.scope.jobId],
        );
        assert(cancelled.rowCount === 1,
          "V3 cancellation-fence interleave did not cancel the claimed attempt");
        this.cancellationCommitted = true;
      }
    }
    return super.findById(params);
  }
}
