import type { Pool, PoolClient } from "pg";
import type { JsonRecord } from "./durable-backend-e2e-json-fields";

export async function seedDurableIdentity(
  db: Pool,
  runtimeIds: {
    readonly runId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly membershipId: string;
  },
): Promise<void> {
  await withClient(db, async (client) => {
    await client.query("begin");
    try {
      await client.query(
        `
          insert into tenants (id, slug, name, created_at, updated_at)
          values ($1, $2, $3, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [
          runtimeIds.tenantId,
          `tenant-${runtimeIds.runId}`,
          "Durable Backend Loop Tenant",
        ],
      );
      await client.query(
        `
          insert into workspaces (id, tenant_id, slug, name, created_at, updated_at)
          values ($1, $2, $3, $4, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [
          runtimeIds.workspaceId,
          runtimeIds.tenantId,
          `workspace-${runtimeIds.runId}`,
          "Durable Backend Loop Workspace",
        ],
      );
      await client.query(
        `
          insert into users (id, tenant_id, email, display_name, created_at, updated_at)
          values ($1, $2, $3, $4, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [
          runtimeIds.userId,
          runtimeIds.tenantId,
          `ops-${runtimeIds.runId}@internal.local`,
          "Backend Loop Operator",
        ],
      );
      await client.query(
        `
          insert into memberships (id, tenant_id, workspace_id, user_id, role, created_at, updated_at)
          values ($1, $2, $3, $4, 'OWNER', now(), now())
          on conflict (tenant_id, workspace_id, user_id) do update set role = 'OWNER', updated_at = excluded.updated_at
        `,
        [
          runtimeIds.membershipId,
          runtimeIds.tenantId,
          runtimeIds.workspaceId,
          runtimeIds.userId,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

export async function durableCounts(
  db: Pool,
  tenantId: string,
  workspaceId: string,
): Promise<JsonRecord> {
  return withClient(db, async (client) => {
    const result = await client.query<{
      topics: number;
      scan_jobs: number;
      feed_items: number;
      summary_jobs: number;
      summaries: number;
      feedback: number;
      digests: number;
      delivery_attempts: number;
    }>(
      `
        select
          (select count(*)::int from topics where tenant_id = $1 and workspace_id = $2) as topics,
          (select count(*)::int from scan_jobs where tenant_id = $1 and workspace_id = $2) as scan_jobs,
          (select count(*)::int from feed_items where tenant_id = $1 and workspace_id = $2) as feed_items,
          (select count(*)::int from summary_jobs where tenant_id = $1 and workspace_id = $2) as summary_jobs,
          (select count(*)::int from summary_artifacts where tenant_id = $1 and workspace_id = $2) as summaries,
          (select count(*)::int from summary_feedback where tenant_id = $1 and workspace_id = $2) as feedback,
          (select count(*)::int from digests where tenant_id = $1 and workspace_id = $2) as digests,
          (select count(*)::int from delivery_attempts where tenant_id = $1 and workspace_id = $2) as delivery_attempts
      `,
      [tenantId, workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("durable count query returned no row");
    }

    return {
      topics: Number(row.topics),
      scanJobs: Number(row.scan_jobs),
      feedItems: Number(row.feed_items),
      summaryJobs: Number(row.summary_jobs),
      summaries: Number(row.summaries),
      feedback: Number(row.feedback),
      digests: Number(row.digests),
      deliveryAttempts: Number(row.delivery_attempts),
    };
  });
}

export async function scheduledScanEvidenceSnapshot(db: Pool, params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
}): Promise<JsonRecord | undefined> {
  return withClient(db, async (client) => {
    const result = await client.query<{
      scan_job_id: string;
      status: string;
      scheduled_idempotency_key: string;
      completed_at: Date | null;
      failure_reason: string | null;
      next_run_at_after_schedule: Date;
      feed_item_count: number;
      feed_item_ids: string[] | null;
    }>(
      `
        select
          j.id as scan_job_id,
          j.status,
          j.idempotency_key as scheduled_idempotency_key,
          j.completed_at,
          j.failure_reason,
          p.next_run_at as next_run_at_after_schedule,
          count(fi.id)::int as feed_item_count,
          coalesce(array_agg(fi.id::text order by fi.observed_at desc) filter (where fi.id is not null), array[]::text[]) as feed_item_ids
        from scan_jobs j
        join scan_policies p on p.id = j.scan_policy_id
        left join feed_items fi
          on fi.tenant_id = j.tenant_id
          and fi.workspace_id = j.workspace_id
          and fi.source_binding_id = j.source_binding_id
        where j.tenant_id = $1
          and j.workspace_id = $2
          and j.source_binding_id = $3
          and j.scan_policy_id = $4
          and j.idempotency_key like 'scheduled:%'
        group by j.id, j.status, j.idempotency_key, j.completed_at, j.failure_reason, p.next_run_at, j.created_at
        order by j.created_at desc
        limit 1
      `,
      [
        params.tenantId,
        params.workspaceId,
        params.sourceBindingId,
        params.scanPolicyId,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return undefined;
    }

    return {
      scanJobId: row.scan_job_id,
      status: row.status,
      scheduledIdempotencyKey: row.scheduled_idempotency_key,
      completedAt: row.completed_at?.toISOString() ?? "",
      failureReason: row.failure_reason,
      nextRunAtAfterSchedule: row.next_run_at_after_schedule.toISOString(),
      feedItemCount: Number(row.feed_item_count),
      feedItemIds: row.feed_item_ids ?? [],
    };
  });
}

export async function autoSummaryEvidenceSnapshot(db: Pool, params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
}): Promise<JsonRecord | undefined> {
  return withClient(db, async (client) => {
    const result = await client.query<{
      summary_job_id: string;
      summary_id: string | null;
      idempotency_key: string;
      status: string;
      requested_at: Date;
      completed_at: Date | null;
      failure_reason: string | null;
      latest_feed_item_observed_at: Date | null;
      new_feed_item_count: number;
    }>(
      `
        with selected_job as (
          select
            j.id,
            j.tenant_id,
            j.workspace_id,
            j.topic_id,
            j.summary_artifact_id,
            j.idempotency_key,
            j.status,
            j.requested_at,
            j.completed_at,
            j.failure_reason
          from summary_jobs j
          where j.tenant_id = $1
            and j.workspace_id = $2
            and j.topic_id = $3
            and j.user_id is null
            and j.subscription_id is null
            and j.idempotency_key like 'auto-summary:%'
          order by j.requested_at desc, j.id desc
          limit 1
        ),
        previous_summary as (
          select max(previous.requested_at) as requested_at
          from summary_jobs previous
          join selected_job selected
            on selected.tenant_id = previous.tenant_id
           and selected.workspace_id = previous.workspace_id
           and selected.topic_id = previous.topic_id
          where previous.user_id is null
            and previous.subscription_id is null
            and previous.requested_at < selected.requested_at
        )
        select
          selected.id as summary_job_id,
          selected.summary_artifact_id as summary_id,
          selected.idempotency_key,
          lower(selected.status::text) as status,
          selected.requested_at,
          selected.completed_at,
          selected.failure_reason,
          max(fi.observed_at) filter (
            where fi.observed_at <= selected.requested_at
              and (previous.requested_at is null or fi.observed_at > previous.requested_at)
          ) as latest_feed_item_observed_at,
          count(fi.id) filter (
            where fi.observed_at <= selected.requested_at
              and (previous.requested_at is null or fi.observed_at > previous.requested_at)
          )::int as new_feed_item_count
        from selected_job selected
        cross join previous_summary previous
        left join feed_items fi
          on fi.tenant_id = selected.tenant_id
          and fi.workspace_id = selected.workspace_id
          and fi.topic_id = selected.topic_id
          and fi.status = 'VISIBLE'
        group by
          selected.id,
          selected.summary_artifact_id,
          selected.idempotency_key,
          selected.status,
          selected.requested_at,
          selected.completed_at,
          selected.failure_reason
      `,
      [params.tenantId, params.workspaceId, params.interestId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return undefined;
    }

    return {
      summaryJobId: row.summary_job_id,
      summaryId: row.summary_id ?? "",
      idempotencyKey: row.idempotency_key,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? "",
      failureReason: row.failure_reason,
      latestFeedItemObservedAt:
        row.latest_feed_item_observed_at?.toISOString() ?? "",
      newFeedItemCount: Number(row.new_feed_item_count),
    };
  });
}

async function withClient<T>(
  db: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
