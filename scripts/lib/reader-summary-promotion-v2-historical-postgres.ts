import { Pool, type PoolClient } from "pg";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { JsonObject } from "@social-monitor/shared-kernel";
import { runWithTenantDatabaseAccess } from
  "@social-monitor/platform-persistence";

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
import {
  isHistoricalPromotionTargetTuple,
  verifyHistoricalPromotionArtifact,
  type HistoricalPromotionArtifactRecord,
  type HistoricalPromotionArtifactVerification,
} from "./reader-summary-promotion-v2-historical-artifact";
import {
  historicalPromotionGenerationAuthority,
  type HistoricalPromotionPolicySnapshot,
} from "./reader-summary-promotion-v2-historical-generation-authority";

type AuthorityRow = Readonly<{
  feedItemId: string;
  providerKey: string;
  providerMetadata: unknown;
  publishedAt: Date | string;
  observedAt: Date | string;
  dayEndMetricProofSource: string | null;
  dayEndMetricProofObservedAt: Date | string | null;
  dayEndMetricProofCompleteThroughAt: Date | string | null;
  dayEndMetricProofMetrics: unknown;
}>;

type CountRow = Readonly<{
  engagementSnapshotCount: string;
  engagementObservationByOriginalDayEndCount: string;
}>;
type LineageMismatchRow = Readonly<{ mismatchCount: string }>;
type AuthorityLedgerRow = Readonly<{
  kind: string;
  identity: string;
  sourceItemId: string;
  providerKey: string;
  observedAt: Date | string;
  completeThroughAt: Date | string | null;
  metricsHash: string | null;
  metrics: unknown;
}>;

type PublicationRow = HistoricalPromotionArtifactRecord & Readonly<{
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
type PolicyRow = HistoricalPromotionPolicySnapshot;

export interface HistoricalPromotionApiVisibilityVerifier {
  verify(input: {
    date: string;
    artifactId: string;
    tenantId: string;
    workspaceId: string;
    expected: HistoricalPromotionArtifactVerification;
  }): Promise<Readonly<{
    siteReaderRouteHttp200Verified: true;
    siteFacingContractVerified: true | "not-exposed";
  }>>;
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
    artifactOutput: string;
    api: HistoricalPromotionApiVisibilityVerifier;
    env?: Readonly<Record<string, string | undefined>>;
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

  async inspect(
    date: string,
    timestampPolicy: "published_at" | "observed_at" = "published_at",
  ): Promise<HistoricalPromotionAuthorityInspection> {
    return this.readOnly(async (client) => {
      const lineage = await client.query<LineageMismatchRow>(
        authorityLineageMismatchQuery,
        [this.input.tenantId, this.input.workspaceId, date, timestampPolicy],
      );
      if (lineage.rows.length !== 1 ||
          exactCount(lineage.rows[0]!.mismatchCount, "provider lineage mismatch") !==
            0) {
        throw new Error(
          "Historical promotion engagement provider lineage is inconsistent",
        );
      }
      const parameters = [
        this.input.tenantId, this.input.workspaceId, date, timestampPolicy,
      ];
      const [rows, counts, ledger] = await Promise.all([
        client.query<AuthorityRow>(authorityQuery, parameters),
        client.query<CountRow>(engagementCountsQuery, parameters),
        client.query<AuthorityLedgerRow>(authorityLedgerQuery, parameters),
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
        retainedAuthorityDigest: retainedAuthorityDigest(ledger.rows),
      };
    });
  }

  async readGenerationAuthority() {
    return this.readOnly(async (client) => {
      const rows = await client.query<PolicyRow>(policyQuery, [
        this.input.tenantId,
        this.input.workspaceId,
      ]);
      if (rows.rows.length !== 1) {
        throw new Error("Historical promotion ReaderSummaryPolicy snapshot is missing");
      }
      return historicalPromotionGenerationAuthority({
        tenantId: this.input.tenantId,
        workspaceId: this.input.workspaceId,
        env: this.input.env ?? process.env,
        policy: rows.rows[0]!,
      });
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
        isValidV2Publication(active));
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
      if (bundle !== undefined && active !== null &&
          active.publicationId === bundle.sourcePublicationId &&
          publicationTupleKind(active) !== "strict-v1") {
        return {
          state: "ambiguous",
          activePublicationId: active.publicationId,
          reason: "active_source_publication_tuple_is_not_strict_v1",
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
        previousArtifactId: bundle?.sourceArtifactId,
        previousReportSha256: bundle?.sourcePublicationReportSha256,
        previousProofSha256: bundle?.sourcePublicationProofSha256,
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
        isValidV2Publication(active);
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
          input.state.artifactId !== active.artifactId) {
        throw new Error("Historical V2 active publication readback is inconsistent");
      }
      const verified = verifyHistoricalPromotionArtifact(active);
      if (!isHistoricalPromotionTargetTuple(verified)) {
        throw new Error("Historical active publication is not a valid V2 tuple");
      }
      const counts = {
        top: verified.orderedLanes.top.length,
        additional: verified.orderedLanes.additional.length,
        citations: verified.citationCount,
      };
      assertPublicationQuality(active.qualitySignals);
      return {
        jobId: active.jobId!,
        artifactId: active.artifactId,
        publicationId: active.publicationId,
        previousPublicationId:
          input.state.previousPublicationId ?? active.publicationId,
        rollbackPriorPublication: {
          publicationId: requiredValue(
            input.state.previousPublicationId,
            "prior publication id",
          ),
          artifactId: requiredValue(
            input.state.previousArtifactId,
            "prior artifact id",
          ),
          reportSha256: requiredSha256(requiredValue(
            input.state.previousReportSha256,
            "prior report SHA-256",
          )),
          proofSha256: requiredSha256(requiredValue(
            input.state.previousProofSha256,
            "prior proof SHA-256",
          )),
        },
        reportSha256: requiredSha256(active.reportSha256),
        proofSha256: requiredSha256(active.proofSha256),
        selectedCounts: counts,
        qualityArtifactSha256: qualityArtifactHashes(
          this.input.artifactOutput,
          input.date,
        ),
        verified,
      };
    });
    const visibility = await this.input.api.verify({
      date: input.date,
      artifactId: output.artifactId,
      tenantId: this.input.tenantId,
      workspaceId: this.input.workspaceId,
      expected: output.verified,
    });
    if (visibility.siteFacingContractVerified !== true) {
      throw new Error("Historical promotion site contract is not exposed");
    }
    return {
      jobId: output.jobId,
      artifactId: output.artifactId,
      publicationId: output.publicationId,
      previousPublicationId: output.previousPublicationId,
      rollbackPriorPublication: output.rollbackPriorPublication,
      reportSha256: output.reportSha256,
      proofSha256: output.proofSha256,
      selectedCounts: output.selectedCounts,
      qualityArtifactSha256: output.qualityArtifactSha256,
      qualityGates: {
        artifactPromotionBoardValidated: true,
        citationsVerified: true,
        publicationProofVerified: true,
        apiPromotionTupleVerified: true,
        apiOrderedLanesVerified: true,
        siteReaderRouteHttp200Verified:
          visibility.siteReaderRouteHttp200Verified,
        siteFacingContractVerified: true,
      },
    };
  }

  private async readOnly<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return runWithTenantDatabaseAccess(this.input, async () => {
      const client = await this.pool.connect();
      try {
        await client.query(
          "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        await client.query("SET LOCAL statement_timeout = '60s'");
        const role = await client.query<{
          currentUser: string;
          systemRuntimeMember: boolean;
        }>(`select current_user as "currentUser",
          pg_has_role(
            current_user,
            'social_monitor_tenant_system_runtime',
            'USAGE'
          ) as "systemRuntimeMember"`);
        if (role.rows.length !== 1 ||
            role.rows[0]?.systemRuntimeMember !== true) {
          throw new Error(
            `Historical promotion RLS preflight rejected database role ${role.rows[0]?.currentUser ?? "unknown"}`,
          );
        }
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
    });
  }
}

export class HttpHistoricalPromotionApiVisibilityVerifier
  implements HistoricalPromotionApiVisibilityVerifier {
  constructor(private readonly input: {
    baseUrl: string;
    siteUrl: string;
    siteContractUrl?: string;
    apiKey?: string;
  }) {}

  async verify(input: {
    date: string;
    artifactId: string;
    tenantId: string;
    workspaceId: string;
    expected: HistoricalPromotionArtifactVerification;
  }): Promise<Readonly<{
    siteReaderRouteHttp200Verified: true;
    siteFacingContractVerified: true;
  }>> {
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
    const item = isRecord(body) && Array.isArray(body.items)
      ? body.items.find((candidate) =>
          isRecord(candidate) && candidate.readerSummaryId === input.artifactId)
      : undefined;
    if (!isRecord(item)) {
      throw new Error("Historical promotion API does not expose active artifact");
    }
    assertApiOrderedLanes(item, input.expected);
    const site = await fetch(this.input.siteUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!site.ok) {
      throw new Error(`Historical promotion site route returned ${site.status}`);
    }
    if (this.input.siteContractUrl === undefined) {
      throw new Error("Historical promotion site contract is not configured");
    }
    const contract = await fetch(this.input.siteContractUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        "x-tenant-id": input.tenantId,
        "x-workspace-id": input.workspaceId,
      },
    });
    if (!contract.ok) {
      throw new Error(
        `Historical promotion site contract returned ${contract.status}`,
      );
    }
    const contractBody = await contract.json() as unknown;
    if (!isRecord(contractBody) ||
        contractBody.readerSummaryId !== input.artifactId) {
      throw new Error("Historical promotion site contract is invalid");
    }
    assertApiOrderedLanes(contractBody, input.expected);
    return {
      siteReaderRouteHttp200Verified: true,
      siteFacingContractVerified: true,
    };
  }
}

const authorityQuery = `
  select fi.id::text as "feedItemId",
    fi.provider_key as "providerKey",
    fi.provider_metadata as "providerMetadata",
    fi.published_at as "publishedAt",
    fi.observed_at as "observedAt",
    metric_proof.source as "dayEndMetricProofSource",
    metric_proof.observed_at as "dayEndMetricProofObservedAt",
    metric_proof.complete_through_at as "dayEndMetricProofCompleteThroughAt",
    metric_proof.metrics as "dayEndMetricProofMetrics"
  from feed_items fi
  join source_items source
    on source.tenant_id = fi.tenant_id
    and source.workspace_id = fi.workspace_id
    and source.id = fi.source_item_id
    and source.provider_key = fi.provider_key
  left join lateral (
    select proof.source, proof.observed_at, proof.complete_through_at,
      proof.metrics
    from (
      select 'observation'::text as source,
        observation.observed_at,
        null::timestamptz as complete_through_at,
        jsonb_strip_nulls(jsonb_build_object(
          'score', observation.score, 'likes', observation.likes,
          'reposts', observation.reposts, 'points', observation.points,
          'stars', observation.stars, 'forks', observation.forks,
          'starsGained', observation.stars_gained,
          'upvoteRatioBps', observation.upvote_ratio_bps
        )) as metrics,
        1 as source_priority
      from source_item_engagement_observations observation
      where observation.tenant_id = fi.tenant_id
        and observation.workspace_id = fi.workspace_id
        and observation.source_item_id = fi.source_item_id
        and observation.provider_key = fi.provider_key
        and observation.observed_at < ($3::date + 1)::timestamp at time zone 'UTC'
      union all
      select 'daily-rollup'::text, rollup.last_observed_at,
        rollup.complete_through_at, rollup.closing_metrics, 0
      from source_item_engagement_daily_rollups rollup
      where rollup.tenant_id = fi.tenant_id
        and rollup.workspace_id = fi.workspace_id
        and rollup.source_item_id = fi.source_item_id
        and rollup.provider_key = fi.provider_key
        and rollup.day = $3::date
        and rollup.last_observed_at < ($3::date + 1)::timestamp at time zone 'UTC'
    ) proof
    order by proof.observed_at desc, proof.source_priority asc
    limit 1
  ) metric_proof on true
  where fi.tenant_id = $1::uuid
    and fi.workspace_id = $2::uuid
    and fi.status = 'VISIBLE'
    and case $4::text
      when 'published_at' then fi.published_at
      when 'observed_at' then fi.observed_at
      else null
    end >= $3::date::timestamp at time zone 'UTC'
    and case $4::text
      when 'published_at' then fi.published_at
      when 'observed_at' then fi.observed_at
      else null
    end < ($3::date + 1)::timestamp at time zone 'UTC'
  order by fi.id asc
`;

const authorityLineageMismatchQuery = `
  select count(*)::text as "mismatchCount"
  from feed_items fi
  join source_items source
    on source.tenant_id = fi.tenant_id
    and source.workspace_id = fi.workspace_id
    and source.id = fi.source_item_id
  where fi.tenant_id = $1::uuid
    and fi.workspace_id = $2::uuid
    and fi.status = 'VISIBLE'
    and case $4::text
      when 'published_at' then fi.published_at
      when 'observed_at' then fi.observed_at
      else null
    end >= $3::date::timestamp at time zone 'UTC'
    and case $4::text
      when 'published_at' then fi.published_at
      when 'observed_at' then fi.observed_at
      else null
    end < ($3::date + 1)::timestamp at time zone 'UTC'
    and (source.provider_key <> fi.provider_key
      or exists (
        select 1 from source_item_engagement_snapshots snapshot
        where snapshot.tenant_id = fi.tenant_id
          and snapshot.workspace_id = fi.workspace_id
          and snapshot.source_item_id = fi.source_item_id
          and snapshot.provider_key <> fi.provider_key
      ) or exists (
        select 1 from source_item_engagement_observations observation
        where observation.tenant_id = fi.tenant_id
          and observation.workspace_id = fi.workspace_id
          and observation.source_item_id = fi.source_item_id
          and observation.provider_key <> fi.provider_key
      ) or exists (
        select 1 from source_item_engagement_daily_rollups rollup
        where rollup.tenant_id = fi.tenant_id
          and rollup.workspace_id = fi.workspace_id
          and rollup.source_item_id = fi.source_item_id
          and rollup.provider_key <> fi.provider_key
      ))
`;

const policyQuery = `
  select id::text as id, language, format, tone,
    max_stories as "maxStories", include_risks as "includeRisks",
    include_interest_highlights as "includeInterestHighlights",
    include_repeated_signals as "includeRepeatedSignals",
    dedupe_strategy as "dedupeStrategy",
    custom_instructions as "customInstructions",
    rules_version as "rulesVersion"
  from reader_summary_policies
  where tenant_id = $1::uuid and workspace_id = $2::uuid
    and scope_type = 'workspace' and scope_key = 'workspace'
    and interest_id is null
`;

const engagementCountsQuery = `
  select
    count(distinct snapshot.source_item_id)::text as "engagementSnapshotCount",
    count(distinct observation.id) filter (
      where observation.observed_at < ($3::date + 1)::timestamp at time zone 'UTC'
    )::text as "engagementObservationByOriginalDayEndCount"
  from feed_items fi
  join source_items source
    on source.tenant_id = fi.tenant_id
    and source.workspace_id = fi.workspace_id
    and source.id = fi.source_item_id
    and source.provider_key = fi.provider_key
  left join source_item_engagement_snapshots snapshot
    on snapshot.tenant_id = fi.tenant_id
    and snapshot.workspace_id = fi.workspace_id
    and snapshot.source_item_id = fi.source_item_id
    and snapshot.provider_key = fi.provider_key
  left join source_item_engagement_observations observation
    on observation.tenant_id = fi.tenant_id
    and observation.workspace_id = fi.workspace_id
    and observation.source_item_id = fi.source_item_id
    and observation.provider_key = fi.provider_key
  where fi.tenant_id = $1::uuid
    and fi.workspace_id = $2::uuid
    and fi.status = 'VISIBLE'
    and case $4::text
      when 'published_at' then fi.published_at
      when 'observed_at' then fi.observed_at
      else null
    end >= $3::date::timestamp at time zone 'UTC'
    and case $4::text
      when 'published_at' then fi.published_at
      when 'observed_at' then fi.observed_at
      else null
    end < ($3::date + 1)::timestamp at time zone 'UTC'
`;

const authorityLedgerQuery = `
  with relevant_sources as (
    select distinct fi.source_item_id, fi.provider_key
    from feed_items fi
    join source_items source on source.tenant_id=fi.tenant_id
      and source.workspace_id=fi.workspace_id and source.id=fi.source_item_id
      and source.provider_key=fi.provider_key
    where fi.tenant_id=$1::uuid and fi.workspace_id=$2::uuid
      and fi.status='VISIBLE'
      and case $4::text when 'published_at' then fi.published_at
        when 'observed_at' then fi.observed_at else null end >=
          $3::date::timestamp at time zone 'UTC'
      and case $4::text when 'published_at' then fi.published_at
        when 'observed_at' then fi.observed_at else null end <
          ($3::date + 1)::timestamp at time zone 'UTC'
  )
  select 'snapshot' as kind, snapshot.source_item_id::text as identity,
    snapshot.source_item_id::text as "sourceItemId",
    snapshot.provider_key as "providerKey",
    snapshot.last_observed_at as "observedAt",
    null::timestamptz as "completeThroughAt",
    snapshot.metrics_hash as "metricsHash", to_jsonb(snapshot) as metrics
  from source_item_engagement_snapshots snapshot
  join relevant_sources source on source.source_item_id=snapshot.source_item_id
    and source.provider_key=snapshot.provider_key
  where snapshot.tenant_id=$1::uuid and snapshot.workspace_id=$2::uuid
  union all
  select 'observation', observation.id::text,
    observation.source_item_id::text, observation.provider_key,
    observation.observed_at, null::timestamptz,
    observation.metrics_hash, to_jsonb(observation)
  from source_item_engagement_observations observation
  join relevant_sources source on source.source_item_id=observation.source_item_id
    and source.provider_key=observation.provider_key
  where observation.tenant_id=$1::uuid and observation.workspace_id=$2::uuid
  union all
  select 'daily-rollup', rollup.source_item_id::text || ':' || rollup.day::text,
    rollup.source_item_id::text, rollup.provider_key, rollup.last_observed_at,
    rollup.complete_through_at, null::text, to_jsonb(rollup)
  from source_item_engagement_daily_rollups rollup
  join relevant_sources source on source.source_item_id=rollup.source_item_id
    and source.provider_key=rollup.provider_key
  where rollup.tenant_id=$1::uuid and rollup.workspace_id=$2::uuid
  order by kind, "sourceItemId", identity
`;

const activePublicationQuery = `
      select publication.id::text as "publicationId",
    publication.reader_summary_artifact_id::text as "artifactId",
    publication.reader_summary_job_id::text as "jobId",
    btrim(publication.report_sha256) as "reportSha256",
    btrim(publication.proof_sha256) as "proofSha256",
      artifact.status::text as "status",
      artifact.artifact_payload as "artifactPayload",
    artifact.citations as "citations",
    artifact.quality_signals as "qualitySignals"
    ,artifact.tenant_id::text as "tenantId"
    ,artifact.workspace_id::text as "workspaceId"
    ,artifact.scope_type as "scopeType"
    ,artifact.interest_id::text as "interestId"
    ,artifact.cadence
    ,artifact.period_started_at as "periodStartedAt"
    ,artifact.period_ended_at as "periodEndedAt"
    ,artifact.period_timezone as "periodTimezone"
    ,artifact.user_id as "userId"
    ,artifact.subscription_id::text as "subscriptionId"
    ,artifact.headline
    ,artifact.summary_text as "summaryText"
    ,artifact.created_at as "createdAt"
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
  dayEndMetricProof: row.dayEndMetricProofSource === null ||
      row.dayEndMetricProofObservedAt === null ||
      !isRecord(row.dayEndMetricProofMetrics)
    ? null
    : {
        source: row.dayEndMetricProofSource === "observation"
          ? "observation"
          : "daily-rollup",
        observedAt: exactTimestamp(
          row.dayEndMetricProofObservedAt,
          "dayEndMetricProofObservedAt",
        ),
        completeThroughAt: row.dayEndMetricProofCompleteThroughAt === null
          ? null
          : exactTimestamp(
              row.dayEndMetricProofCompleteThroughAt,
              "dayEndMetricProofCompleteThroughAt",
            ),
        metrics: numericMetricObject(row.dayEndMetricProofMetrics),
      },
});

const numericMetricObject = (value: Record<string, unknown>): JsonObject =>
  Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (typeof item === "number" && Number.isSafeInteger(item)) {
      return [[key, item]];
    }
    if (typeof item === "string" && /^\d+$/u.test(item)) {
      const number = Number(item);
      return Number.isSafeInteger(number) ? [[key, number]] : [];
    }
    return [];
  }));

const retainedAuthorityDigest = (
  rows: readonly AuthorityLedgerRow[],
): string => createHash("sha256").update(JSON.stringify(rows.map((row) => ({
  kind: row.kind,
  identity: row.identity,
  sourceItemId: row.sourceItemId,
  providerKey: row.providerKey,
  observedAt: exactTimestamp(row.observedAt, "ledger observedAt"),
  completeThroughAt: row.completeThroughAt === null
    ? null
    : exactTimestamp(row.completeThroughAt, "ledger completeThroughAt"),
  metricsHash: row.metricsHash,
  metrics: canonicalLedgerValue(row.metrics),
})))).digest("hex");

const canonicalLedgerValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalLedgerValue);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalLedgerValue(item)]));
};

const isValidV2Publication = (row: PublicationRow): boolean => {
  try {
    return isHistoricalPromotionTargetTuple(
      verifyHistoricalPromotionArtifact(row),
    );
  } catch {
    return false;
  }
};

const publicationTupleKind = (
  row: PublicationRow,
): "strict-v1" | "valid-v2" | "valid-no-signal" | "unknown" => {
  try {
    return verifyHistoricalPromotionArtifact(row).kind;
  } catch {
    return "unknown";
  }
};

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

const requiredValue = (value: string | undefined, label: string): string => {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Historical promotion ${label} is missing`);
  }
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertApiOrderedLanes = (
  item: Record<string, unknown>,
  expected: HistoricalPromotionArtifactVerification,
): void => {
  const brief = isRecord(item.readerBrief) ? item.readerBrief : item;
  const top = apiLane(brief.topReads);
  const additional = apiLane(brief.selectedPosts);
  if (JSON.stringify(top) !== JSON.stringify(expected.orderedLanes.top) ||
      JSON.stringify(additional) !==
        JSON.stringify(expected.orderedLanes.additional)) {
    throw new Error("Historical promotion API ordered V2 tuple is inconsistent");
  }
  if (expected.noSignal &&
      (!Array.isArray(item.qualityFlags) ||
        !item.qualityFlags.includes("no_signal") ||
        !isRecord(item.lineage) ||
        item.lineage.promptVersion !== "reader_summary.promotion_no_signal.v1" ||
        item.lineage.modelVersion !== "not_invoked" ||
        item.lineage.providerVersion !== "deterministic" ||
        item.lineage.rulesVersion !== "reader_promotion_policy.v2" ||
        item.lineage.evalDatasetVersion !== "reader_promotion_policy.v2")) {
    throw new Error("Historical promotion API V2 NO_SIGNAL lineage is missing");
  }
};

const qualityArtifactHashes = (
  artifactOutput: string,
  date: string,
): Readonly<Record<string, string>> => {
  const directory = join(
    resolve(artifactOutput),
    date,
    "production-day",
    "quality-artifacts",
  );
  const required = [
    "yesterday-social-collection-quality-report.v1.json",
    "yesterday-reader-summary-artifact-quality.v1.json",
    "reader-summary-quality-dashboard.v1.json",
    "reader-summary-top-read-ranking.v1.json",
    "reader-summary-source-quality-trace.v1.json",
  ];
  const optional = "reader-summary-clean-real-day-e2e-report.v1.json";
  const names = existsSync(join(directory, optional))
    ? [...required, optional]
    : required;
  return Object.fromEntries(names.map((name) => [
    name,
    createHash("sha256").update(readFileSync(join(directory, name))).digest("hex"),
  ]));
};

const apiLane = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error("Historical promotion API reader lane is missing");
  }
  return value.map((card) => {
    if (!isRecord(card) || !isRecord(card.promotionAttestation)) {
      throw new Error("Historical promotion API card tuple is missing");
    }
    return card.promotionAttestation;
  });
};
