import { Pool, type PoolClient } from "pg";

import type { JsonObject } from "@social-monitor/shared-kernel";

import type {
  HistoricalPromotionAuthorityInspection,
  HistoricalPromotionAuthorityRow,
} from "./reader-summary-promotion-v2-historical-classification";
import type {
  HistoricalPromotionAuthorityReader,
  HistoricalPromotionDurableState,
  HistoricalPromotionDurableStateReader,
  HistoricalPromotionEvidenceBundle,
  HistoricalPromotionMutation,
  HistoricalPromotionVerifiedOutput,
} from "./reader-summary-promotion-v2-historical-runner";

type AuthorityRow = Readonly<{
  feedItemId: string;
  providerKey: string;
  providerMetadata: unknown;
  publishedAt: Date | string;
  observedAt: Date | string;
}>;

type CountRow = Readonly<{
  engagementSnapshotCount: string;
  engagementObservationByOriginalDayEndCount: string;
}>;

type PublicationRow = Readonly<{
  publicationId: string;
  artifactId: string;
  jobId: string | null;
  reportSha256: string;
  proofSha256: string;
  artifactPayload: unknown;
  citations: unknown;
  qualitySignals: unknown;
}>;

type JobRow = Readonly<{
  jobId: string;
  status: string;
  artifactId: string | null;
}>;

export interface HistoricalPromotionApiVisibilityVerifier {
  verify(input: {
    date: string;
    artifactId: string;
    tenantId: string;
    workspaceId: string;
  }): Promise<void>;
}

export class PostgresHistoricalPromotionAdapter
  implements HistoricalPromotionAuthorityReader,
    HistoricalPromotionDurableStateReader,
    Pick<HistoricalPromotionMutation, "verifyCompleted"> {
  private readonly pool: Pool;

  constructor(private readonly input: {
    databaseUrl: string;
    tenantId: string;
    workspaceId: string;
    api: HistoricalPromotionApiVisibilityVerifier;
  }) {
    this.pool = new Pool({
      connectionString: input.databaseUrl,
      min: 0,
      max: 2,
      connectionTimeoutMillis: 5_000,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async inspect(date: string): Promise<HistoricalPromotionAuthorityInspection> {
    return this.readOnly(async (client) => {
      const rows = await client.query<AuthorityRow>(authorityQuery, [
        this.input.tenantId,
        this.input.workspaceId,
        date,
      ]);
      const counts = await client.query<CountRow>(engagementCountsQuery, [
        this.input.tenantId,
        this.input.workspaceId,
        date,
      ]);
      const count = counts.rows[0];
      if (count === undefined) {
        throw new Error("Historical promotion engagement inventory is missing");
      }
      return {
        rows: rows.rows.map(normalizeAuthorityRow),
        engagementSnapshotCount: exactCount(
          count.engagementSnapshotCount,
          "engagement snapshot count",
        ),
        engagementObservationByOriginalDayEndCount: exactCount(
          count.engagementObservationByOriginalDayEndCount,
          "engagement observation count",
        ),
      };
    });
  }

  async reconcile(
    date: string,
    rebuildIdentity: string,
    bundle: HistoricalPromotionEvidenceBundle | undefined,
  ): Promise<HistoricalPromotionDurableState> {
    return this.readOnly(async (client) => {
      const active = await activePublication(client, this.input, date);
      const jobs = await client.query<JobRow>(jobsByRebuildIdentityQuery, [
        this.input.tenantId,
        this.input.workspaceId,
        date,
        rebuildIdentity,
      ]);
      const activeIsThisRebuild = jobs.rows.some((job) =>
        active !== null && active.jobId === job.jobId &&
        active.artifactId === job.artifactId &&
        hasV2PromotionAttestations(active.artifactPayload));
      if (bundle !== undefined && active !== null &&
          active.publicationId !== bundle.sourcePublicationId &&
          !activeIsThisRebuild) {
        return {
          state: "ambiguous",
          activePublicationId: active.publicationId,
          reason: "active_source_publication_drifted_from_evidence_manifest",
        };
      }
      if (bundle !== undefined && active !== null &&
          active.publicationId === bundle.sourcePublicationId &&
          (active.artifactId !== bundle.sourceArtifactId ||
            active.reportSha256.trim() !==
              bundle.sourcePublicationReportSha256 ||
            active.proofSha256.trim() !== bundle.sourcePublicationProofSha256)) {
        return {
          state: "ambiguous",
          activePublicationId: active.publicationId,
          reason: "active_source_publication_proof_drifted",
        };
      }
      if (jobs.rows.length === 0) {
        return { state: "none", activePublicationId: active?.publicationId };
      }
      if (jobs.rows.length !== 1) {
        return {
          state: "ambiguous",
          activePublicationId: active?.publicationId,
          reason: "multiple_durable_jobs_share_rebuild_identity",
        };
      }
      const job = jobs.rows[0]!;
      const common = {
        jobId: job.jobId,
        artifactId: job.artifactId ?? undefined,
        activePublicationId: active?.publicationId,
        previousPublicationId: bundle?.sourcePublicationId,
      };
      if (job.status === "REQUESTED") return { ...common, state: "requested" };
      if (job.status === "RUNNING") {
        return {
          ...common,
          state: "in-flight",
          reason: "durable_model_job_may_have_started",
        };
      }
      if (job.status === "FAILED") {
        return {
          ...common,
          state: "failed",
          reason: "failed_model_or_provider_lineage_requires_reconciliation",
        };
      }
      if (job.status === "REJECTED") {
        return {
          ...common,
          state: "quality-rejected",
          reason: "durable_quality_rejection_requires_review",
        };
      }
      const matchesActive = active !== null &&
        active.jobId === job.jobId &&
        active.artifactId === job.artifactId &&
        hasV2PromotionAttestations(active.artifactPayload);
      if ((job.status === "COMPLETED" || job.status === "NO_SIGNAL") &&
          matchesActive) {
        return {
          ...common,
          state: "complete-active",
          publicationId: active.publicationId,
        };
      }
      if (job.status === "COMPLETED" || job.status === "NO_SIGNAL") {
        return {
          ...common,
          state: "complete-detached",
          reason: "completed_job_is_not_the_active_publication",
        };
      }
      return { ...common, state: "ambiguous", reason: "unknown_job_state" };
    });
  }

  async verifyCompleted(input: {
    date: string;
    rebuildIdentity: string;
    state: HistoricalPromotionDurableState;
  }): Promise<HistoricalPromotionVerifiedOutput> {
    const output = await this.readOnly(async (client) => {
      const active = await activePublication(client, this.input, input.date);
      if (active === null || input.state.jobId !== active.jobId ||
          input.state.artifactId !== active.artifactId ||
          !hasV2PromotionAttestations(active.artifactPayload)) {
        throw new Error("Historical V2 active publication readback is inconsistent");
      }
      const counts = selectedCounts(active.artifactPayload, active.citations);
      assertPublicationQuality(active.qualitySignals);
      return {
        jobId: active.jobId!,
        artifactId: active.artifactId,
        publicationId: active.publicationId,
        previousPublicationId:
          input.state.previousPublicationId ?? active.publicationId,
        reportSha256: requiredSha256(active.reportSha256),
        proofSha256: requiredSha256(active.proofSha256),
        selectedCounts: counts,
      };
    });
    await this.input.api.verify({
      date: input.date,
      artifactId: output.artifactId,
      tenantId: this.input.tenantId,
      workspaceId: this.input.workspaceId,
    });
    return {
      ...output,
      qualityGates: {
        promotionV2Attested: true,
        citationsVerified: true,
        publicationProofVerified: true,
        apiVisibilityVerified: true,
      },
    };
  }

  private async readOnly<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '60s'");
      await client.query(
        "SELECT set_config('social_monitor.system_access', 'true', true)",
      );
      const output = await work(client);
      await client.query("COMMIT");
      return output;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export class HttpHistoricalPromotionApiVisibilityVerifier
  implements HistoricalPromotionApiVisibilityVerifier {
  constructor(private readonly input: { baseUrl: string; apiKey?: string }) {}

  async verify(input: {
    date: string;
    artifactId: string;
    tenantId: string;
    workspaceId: string;
  }): Promise<void> {
    const start = `${input.date}T00:00:00.000Z`;
    const endDate = new Date(start);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const url = new URL("/reader-summaries", this.input.baseUrl);
    url.searchParams.set("scopeType", "workspace");
    url.searchParams.set("cadence", "daily");
    url.searchParams.set("periodStartedAt", start);
    url.searchParams.set("periodEndedAt", endDate.toISOString());
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("limit", "5");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        "x-tenant-id": input.tenantId,
        "x-workspace-id": input.workspaceId,
        "x-workspace-role": "viewer",
        ...(this.input.apiKey === undefined
          ? {}
          : { authorization: `Bearer ${this.input.apiKey}` }),
      },
    });
    if (!response.ok) {
      throw new Error(`Historical promotion API visibility returned ${response.status}`);
    }
    const body = await response.json() as unknown;
    if (!isRecord(body) || !Array.isArray(body.items) ||
        !body.items.some((item) =>
          isRecord(item) && item.readerSummaryId === input.artifactId)) {
      throw new Error("Historical promotion API does not expose active artifact");
    }
  }
}

const authorityQuery = `
  select fi.id::text as "feedItemId",
    fi.provider_key as "providerKey",
    fi.provider_metadata as "providerMetadata",
    fi.published_at as "publishedAt",
    fi.observed_at as "observedAt"
  from feed_items fi
  where fi.tenant_id = $1::uuid
    and fi.workspace_id = $2::uuid
    and fi.status = 'VISIBLE'
    and fi.published_at >= $3::date::timestamp at time zone 'UTC'
    and fi.published_at < ($3::date + 1)::timestamp at time zone 'UTC'
  order by fi.id asc
`;

const engagementCountsQuery = `
  select
    count(distinct snapshot.source_item_id)::text as "engagementSnapshotCount",
    count(distinct observation.id) filter (
      where observation.observed_at < ($3::date + 1)::timestamp at time zone 'UTC'
    )::text as "engagementObservationByOriginalDayEndCount"
  from feed_items fi
  left join source_item_engagement_snapshots snapshot
    on snapshot.tenant_id = fi.tenant_id
    and snapshot.workspace_id = fi.workspace_id
    and snapshot.source_item_id = fi.source_item_id
  left join source_item_engagement_observations observation
    on observation.tenant_id = fi.tenant_id
    and observation.workspace_id = fi.workspace_id
    and observation.source_item_id = fi.source_item_id
  where fi.tenant_id = $1::uuid
    and fi.workspace_id = $2::uuid
    and fi.status = 'VISIBLE'
    and fi.published_at >= $3::date::timestamp at time zone 'UTC'
    and fi.published_at < ($3::date + 1)::timestamp at time zone 'UTC'
`;

const activePublicationQuery = `
  select publication.id::text as "publicationId",
    publication.reader_summary_artifact_id::text as "artifactId",
    publication.reader_summary_job_id::text as "jobId",
    btrim(publication.report_sha256) as "reportSha256",
    btrim(publication.proof_sha256) as "proofSha256",
    artifact.artifact_payload as "artifactPayload",
    artifact.citations as "citations",
    artifact.quality_signals as "qualitySignals"
  from reader_summary_publication_slots slot
  join reader_summary_publications publication
    on publication.id = slot.current_publication_id
  join reader_summary_artifacts artifact
    on artifact.id = publication.reader_summary_artifact_id
  where slot.tenant_id = $1::uuid
    and slot.workspace_id = $2::uuid
    and slot.scope_type = 'workspace'
    and slot.scope_key = 'workspace'
    and slot.cadence = 'daily'
    and slot.period_started_at = $3::date::timestamp at time zone 'UTC'
    and slot.period_ended_at = ($3::date + 1)::timestamp at time zone 'UTC'
    and slot.period_timezone = 'UTC'
`;

const jobsByRebuildIdentityQuery = `
  select job.id::text as "jobId", job.status::text as "status",
    job.reader_summary_artifact_id::text as "artifactId"
  from reader_summary_jobs job
  where job.tenant_id = $1::uuid
    and job.workspace_id = $2::uuid
    and job.scope_type = 'workspace'
    and job.scope_key = 'workspace'
    and job.cadence = 'daily'
    and job.period_started_at = $3::date::timestamp at time zone 'UTC'
    and job.period_ended_at = ($3::date + 1)::timestamp at time zone 'UTC'
    and job.period_timezone = 'UTC'
    and job.idempotency_key like ('%:' || $4::text)
  order by job.created_at asc, job.id asc
`;

const activePublication = async (
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string },
  date: string,
): Promise<PublicationRow | null> => {
  const result = await client.query<PublicationRow>(activePublicationQuery, [
    scope.tenantId,
    scope.workspaceId,
    date,
  ]);
  if (result.rows.length > 1) {
    throw new Error("Historical promotion has multiple active publications");
  }
  return result.rows[0] ?? null;
};

const normalizeAuthorityRow = (row: AuthorityRow): HistoricalPromotionAuthorityRow => ({
  feedItemId: row.feedItemId,
  providerKey: row.providerKey,
  providerMetadata: isRecord(row.providerMetadata)
    ? row.providerMetadata as JsonObject
    : null,
  publishedAt: exactTimestamp(row.publishedAt, "publishedAt"),
  observedAt: exactTimestamp(row.observedAt, "observedAt"),
});

const selectedCounts = (
  payload: unknown,
  citations: unknown,
): HistoricalPromotionVerifiedOutput["selectedCounts"] => {
  if (!isRecord(payload) || !Array.isArray(payload.promotionAttestations) ||
      !Array.isArray(citations)) {
    throw new Error("Historical V2 publication selected-count proof is missing");
  }
  const decisions = payload.promotionAttestations.flatMap((value) =>
    isRecord(value) && typeof value.decision === "string" ? [value.decision] : [],
  );
  return {
    top: decisions.filter((value) => value === "promote_top").length,
    additional: decisions.filter((value) => value === "promote_additional").length,
    citations: citations.length,
  };
};

const hasV2PromotionAttestations = (payload: unknown): boolean =>
  isRecord(payload) && Array.isArray(payload.promotionAttestations) &&
  payload.promotionAttestations.every((value) =>
    isRecord(value) && value.policyVersion === "reader_post_promotion.v2");

const assertPublicationQuality = (value: unknown): void => {
  if (!isRecord(value) || !isRecord(value.publicationDecision) ||
      value.publicationDecision.status !== "published" ||
      value.publicationDecision.qualityPassed !== true) {
    throw new Error("Historical V2 publication quality proof is incomplete");
  }
};

const exactTimestamp = (value: Date | string, label: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Historical promotion ${label} is invalid`);
  }
  return date.toISOString();
};

const exactCount = (value: string, label: string): number => {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`Historical promotion ${label} is invalid`);
  }
  return Number.parseInt(value, 10);
};

const requiredSha256 = (value: string): string => {
  const normalized = value.trim();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error("Historical V2 publication SHA-256 is invalid");
  }
  return normalized;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
