import { createHash } from "node:crypto";

export const dailyScanTerminalRepairConfirmation =
  "reader-summary-daily-scan-terminal-repair-c1" as const;
export const dailyScanTerminalRepairRuntimeRole =
  "social_monitor_system_app" as const;
export const dailyScanTerminalRepairSchemaVersion =
  "reader_summary.daily_scan_terminal_repair.c1" as const;
export const dailyScanTerminalRepairScope = Object.freeze({
  tenantId: "00000000-0000-7000-8000-000000000901",
  workspaceId: "00000000-0000-7000-8000-000000000902",
});

export const dailyScanTerminalRepairTargets = Object.freeze({
  hackerNews: Object.freeze({
    jobId: "e630ed7d-42b7-4bf0-a747-f9bdf0f8a9d7",
    sourceBindingId: "0348ff97-3925-4d04-a192-7e782badbf50",
    leaseId: "703fd7b5-cf83-4508-a5b1-5a9dfdc4643e",
  }),
  reddit: Object.freeze({
    jobId: "b9de1ac8-4490-48d6-befa-a25472b5e94a",
    sourceBindingId: "8e753ea9-fb03-4c05-8288-6e871cb20b27",
    failureReasonSha256:
      "f6080204874629cf05223f8dc7650330a89106f0e4562a92b4b5310bd9f90ad1",
  }),
});

export type DailyScanTerminalRepairTargetContract = Readonly<{
  hackerNews: Readonly<{
    jobId: string;
    sourceBindingId: string;
    leaseId: string;
  }>;
  reddit: Readonly<{
    jobId: string;
    sourceBindingId: string;
    failureReasonSha256: string;
  }>;
}>;

export type DailyScanTerminalRepairSqlClient = Readonly<{
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[]; rowCount: number | null }>>;
}>;

type CapturedTarget = Readonly<{
  target: "hacker_news" | "reddit";
  snapshot: Record<string, unknown>;
}>;

export type DailyScanTerminalRepairReceipt = Readonly<{
  schemaVersion: typeof dailyScanTerminalRepairSchemaVersion;
  confirmation: typeof dailyScanTerminalRepairConfirmation;
  reviewedPreimageSha256: string;
  transactionTimestamp: string;
  targets: readonly Readonly<{
    target: "hacker_news" | "reddit";
    jobId: string;
    sourceBindingId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }>[];
  restoreEvidenceSha256: string;
}>;

const captureSql = `
  WITH target(job_id, binding_id, tenant_id, workspace_id, target) AS (VALUES
    ($1::UUID, $2::UUID, $5::UUID, $6::UUID, 'hacker_news'::TEXT),
    ($3::UUID, $4::UUID, $5::UUID, $6::UUID, 'reddit'::TEXT)
  ), captured AS (
    SELECT target.target,
      jsonb_build_object(
        'job', to_jsonb(job),
        'attempt', to_jsonb(attempt),
        'lease', to_jsonb(lease),
        'binding', to_jsonb(binding),
        'source', to_jsonb(source),
        'policy', to_jsonb(policy),
        'schedulerDecisions', COALESCE(decisions.rows, '[]'::JSONB),
        'failureMetadataSqlNull', job.failure_metadata IS NULL,
        'executionMetadataSqlNull', job.execution_metadata IS NULL,
        'downstream', jsonb_build_object(
          'failureQueue', (SELECT count(*) FROM public.scan_failure_queue_entries q WHERE q.scan_job_id=job.id AND q.tenant_id=target.tenant_id AND q.workspace_id=target.workspace_id),
          'githubCandidates', (SELECT count(*) FROM public.github_repository_trend_candidates c WHERE c.scan_job_id=job.id AND c.tenant_id=target.tenant_id AND c.workspace_id=target.workspace_id),
          'githubResults', (SELECT count(*) FROM public.github_repository_trend_results r WHERE r.scan_job_id=job.id AND r.tenant_id=target.tenant_id AND r.workspace_id=target.workspace_id),
          'engagementObservations', (SELECT count(*) FROM public.source_item_engagement_observations o WHERE o.scan_job_id=job.id AND o.tenant_id=target.tenant_id AND o.workspace_id=target.workspace_id),
          'sourceItems', (SELECT count(*) FROM public.source_items i WHERE i.source_binding_id=job.source_binding_id AND i.tenant_id=target.tenant_id AND i.workspace_id=target.workspace_id AND i.observed_at >= job.requested_at AND i.observed_at <= policy.next_run_at),
          'feedItems', (SELECT count(*) FROM public.feed_items f WHERE f.source_binding_id=job.source_binding_id AND f.tenant_id=target.tenant_id AND f.workspace_id=target.workspace_id AND f.observed_at >= job.requested_at AND f.observed_at <= policy.next_run_at),
          'outbox', (SELECT count(*) FROM public.outbox_events o WHERE o.tenant_id=target.tenant_id AND o.workspace_id=target.workspace_id AND o.payload::TEXT LIKE '%' || job.id::TEXT || '%'),
          'inbox', (SELECT count(*) FROM public.inbox_records i JOIN public.outbox_events o ON o.id=i.event_id AND o.tenant_id=target.tenant_id AND o.workspace_id=target.workspace_id WHERE i.tenant_id=target.tenant_id AND o.payload::TEXT LIKE '%' || job.id::TEXT || '%'),
          'idempotency', (SELECT count(*) FROM public.idempotency_keys k WHERE k.tenant_id=target.tenant_id AND k.workspace_id=target.workspace_id AND (k.key=job.idempotency_key OR k.key LIKE '%' || job.id::TEXT || '%' OR k.response_payload::TEXT LIKE '%' || job.id::TEXT || '%')),
          'cursor', (SELECT count(*) FROM public.cursor_checkpoints c WHERE c.source_binding_id=job.source_binding_id AND c.tenant_id=target.tenant_id AND c.workspace_id=target.workspace_id AND c.updated_at BETWEEN job.requested_at AND policy.next_run_at)
        )
      ) AS snapshot
    FROM target
    JOIN public.scan_jobs job ON job.id=target.job_id AND job.source_binding_id=target.binding_id
      AND job.tenant_id=target.tenant_id AND job.workspace_id=target.workspace_id
    JOIN public.scan_attempts attempt ON attempt.scan_job_id=job.id AND attempt.source_binding_id=target.binding_id
      AND attempt.tenant_id=target.tenant_id AND attempt.workspace_id=target.workspace_id
    JOIN public.source_bindings binding ON binding.id=target.binding_id
      AND binding.tenant_id=target.tenant_id AND binding.workspace_id=target.workspace_id
      AND binding.tenant_id=job.tenant_id AND binding.workspace_id=job.workspace_id
    JOIN public.source_catalog_entries source
      ON source.id=binding.source_catalog_entry_id
    JOIN public.scan_policies policy ON policy.id=job.scan_policy_id
      AND policy.source_binding_id=target.binding_id
      AND policy.tenant_id=target.tenant_id AND policy.workspace_id=target.workspace_id
      AND policy.tenant_id=binding.tenant_id AND policy.workspace_id=binding.workspace_id
    LEFT JOIN public.scan_leases lease ON lease.scan_job_id=job.id
      AND lease.tenant_id=target.tenant_id AND lease.workspace_id=target.workspace_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(to_jsonb(decision) ORDER BY decision.id), '[]'::JSONB) AS rows
      FROM public.scan_scheduler_decisions decision WHERE decision.scan_job_id=job.id
        AND decision.tenant_id=target.tenant_id AND decision.workspace_id=target.workspace_id
    ) decisions
    ORDER BY target.target
    FOR UPDATE OF job, attempt, binding, source, policy
  )
  SELECT target, snapshot FROM captured ORDER BY target
`;
const reviewCaptureSql = captureSql.replace(
  "    FOR UPDATE OF job, attempt, binding, source, policy\n",
  "",
);

const receiptReadbackSql = `
  SELECT target.target,
    jsonb_build_object(
      'job', to_jsonb(job), 'attempt', to_jsonb(attempt),
      'lease', to_jsonb(lease), 'binding', to_jsonb(binding),
      'source', to_jsonb(source),
      'policy', to_jsonb(policy),
      'schedulerDecisions', COALESCE(decisions.rows, '[]'::JSONB),
      'failureMetadataSqlNull', job.failure_metadata IS NULL,
      'executionMetadataSqlNull', job.execution_metadata IS NULL
    ) AS snapshot
  FROM (VALUES
    ($1::UUID, $2::UUID, $5::UUID, $6::UUID, 'hacker_news'::TEXT),
    ($3::UUID, $4::UUID, $5::UUID, $6::UUID, 'reddit'::TEXT)
  ) target(job_id,binding_id,tenant_id,workspace_id,target)
  JOIN public.scan_jobs job ON job.id=target.job_id AND job.source_binding_id=target.binding_id
    AND job.tenant_id=target.tenant_id AND job.workspace_id=target.workspace_id
  JOIN public.scan_attempts attempt ON attempt.scan_job_id=job.id
    AND attempt.source_binding_id=target.binding_id
    AND attempt.tenant_id=target.tenant_id AND attempt.workspace_id=target.workspace_id
  JOIN public.source_bindings binding ON binding.id=target.binding_id
    AND binding.tenant_id=target.tenant_id AND binding.workspace_id=target.workspace_id
    AND binding.tenant_id=job.tenant_id AND binding.workspace_id=job.workspace_id
  JOIN public.source_catalog_entries source
    ON source.id=binding.source_catalog_entry_id
  JOIN public.scan_policies policy ON policy.id=job.scan_policy_id
    AND policy.source_binding_id=target.binding_id
    AND policy.tenant_id=target.tenant_id AND policy.workspace_id=target.workspace_id
    AND policy.tenant_id=binding.tenant_id AND policy.workspace_id=binding.workspace_id
  LEFT JOIN public.scan_leases lease ON lease.scan_job_id=job.id
    AND lease.tenant_id=target.tenant_id AND lease.workspace_id=target.workspace_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(to_jsonb(decision) ORDER BY decision.id), '[]'::JSONB) AS rows
    FROM public.scan_scheduler_decisions decision WHERE decision.scan_job_id=job.id
      AND decision.tenant_id=target.tenant_id AND decision.workspace_id=target.workspace_id
  ) decisions
  ORDER BY target.target
`;

export const captureDailyScanTerminalRepairPreimage = async (
  client: DailyScanTerminalRepairSqlClient,
  options: Readonly<{
    lockTargets?: boolean;
    targetContract?: DailyScanTerminalRepairTargetContract;
  }> = {},
): Promise<
  Readonly<{ sha256: string; targets: readonly CapturedTarget[] }>
> => {
  const result = await client.query<CapturedTarget>(
    options.lockTargets === false ? reviewCaptureSql : captureSql,
    targetValues(options.targetContract),
  );
  assertCapturedPreimage(
    result.rows,
    options.targetContract ?? dailyScanTerminalRepairTargets,
  );
  return Object.freeze({ sha256: digest(result.rows), targets: result.rows });
};

export const captureDailyScanTerminalRepairPreimageForReview = async (
  client: DailyScanTerminalRepairSqlClient,
  targetContract: DailyScanTerminalRepairTargetContract = dailyScanTerminalRepairTargets,
): Promise<
  Readonly<{
    capturedAt: string;
    sha256: string;
    targets: readonly CapturedTarget[];
  }>
> => {
  try {
    await beginAuthorizedTransaction(client, true);
    const capturedAt = (
      await client.query<{ now: string }>(
        "SELECT (to_jsonb(transaction_timestamp()) #>> '{}') AS now",
      )
    ).rows[0]?.now;
    if (
      typeof capturedAt !== "string" ||
      Number.isNaN(Date.parse(capturedAt))
    ) {
      throw new Error("Daily scan terminal repair capture time is missing");
    }
    const captured = await captureDailyScanTerminalRepairPreimage(client, {
      lockTargets: false,
      targetContract,
    });
    await client.query("ROLLBACK");
    return Object.freeze({ capturedAt, ...captured });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

export const repairDailyScanTerminals = async (
  params: Readonly<{
    client: DailyScanTerminalRepairSqlClient;
    reviewedPreimageSha256: string;
    persistReceiptBeforeCommit(
      receipt: DailyScanTerminalRepairReceipt,
    ): void | Promise<void>;
    discardPreparedReceipt(): void | Promise<void>;
    targetContract?: DailyScanTerminalRepairTargetContract;
  }>,
): Promise<DailyScanTerminalRepairReceipt> => {
  const targetContract =
    params.targetContract ?? dailyScanTerminalRepairTargets;
  requireDigest(params.reviewedPreimageSha256, "reviewed preimage");
  let commitAttempted = false;
  try {
    await beginAuthorizedTransaction(params.client, false);
    const before = await captureDailyScanTerminalRepairPreimage(params.client, {
      targetContract,
    });
    if (before.sha256 !== params.reviewedPreimageSha256) {
      throw new Error(
        "Daily scan terminal repair preimage drifted; zero writes permitted",
      );
    }
    const byTarget = new Map(
      before.targets.map((row) => [row.target, row.snapshot]),
    );
    const hackerNews = byTarget.get("hacker_news");
    const reddit = byTarget.get("reddit");
    if (hackerNews === undefined || reddit === undefined) {
      throw new Error("Daily scan terminal repair preimage is incomplete");
    }

    const transactionTimestamp = (
      await params.client.query<{ now: string }>(
        "SELECT (to_jsonb(transaction_timestamp()) #>> '{}') AS now",
      )
    ).rows[0]?.now;
    if (typeof transactionTimestamp !== "string") {
      throw new Error("Daily scan terminal repair transaction time is missing");
    }

    await exactUpdate(
      params.client,
      `
      UPDATE public.scan_attempts SET status='FAILED',
        finished_at=$3::TIMESTAMPTZ,
        failure_reason='reviewed_quiescent_orphan_terminalization_c1',
        updated_at=$3::TIMESTAMPTZ
      WHERE scan_job_id=$1::UUID AND source_binding_id=$2::UUID
        AND tenant_id=$4::UUID AND workspace_id=$5::UUID
        AND status='RUNNING' AND attempt_number=1
        AND fetched=0 AND inserted=0 AND skipped_duplicates=0 AND projected=0
        AND failure_reason IS NULL AND finished_at IS NULL
    `,
      [
        targetContract.hackerNews.jobId,
        targetContract.hackerNews.sourceBindingId,
        transactionTimestamp,
        dailyScanTerminalRepairScope.tenantId,
        dailyScanTerminalRepairScope.workspaceId,
      ],
      "Hacker News attempt",
    );
    await exactUpdate(
      params.client,
      `
      UPDATE public.scan_jobs SET status='FAILED', leased_until=NULL,
        completed_at=$3::TIMESTAMPTZ,
        failure_reason='reviewed_quiescent_orphan_terminalization_c1',
        updated_at=$3::TIMESTAMPTZ
      WHERE id=$1::UUID AND source_binding_id=$2::UUID
        AND tenant_id=$4::UUID AND workspace_id=$5::UUID
        AND status='ENQUEUED' AND retry_count=0 AND failure_reason IS NULL
    `,
      [
        targetContract.hackerNews.jobId,
        targetContract.hackerNews.sourceBindingId,
        transactionTimestamp,
        dailyScanTerminalRepairScope.tenantId,
        dailyScanTerminalRepairScope.workspaceId,
      ],
      "Hacker News job",
    );
    await exactUpdate(
      params.client,
      `DELETE FROM public.scan_leases
      WHERE id=$1::UUID AND scan_job_id=$2::UUID
        AND tenant_id=$3::UUID AND workspace_id=$4::UUID`,
      [
        targetContract.hackerNews.leaseId,
        targetContract.hackerNews.jobId,
        dailyScanTerminalRepairScope.tenantId,
        dailyScanTerminalRepairScope.workspaceId,
      ],
      "Hacker News lease",
    );
    await exactUpdate(
      params.client,
      `
      UPDATE public.scan_jobs job SET status='FAILED', leased_until=NULL,
        completed_at=attempt.finished_at,
        failure_reason=attempt.failure_reason,
        updated_at=$3::TIMESTAMPTZ
      FROM public.scan_attempts attempt
      WHERE job.id=$1::UUID AND job.source_binding_id=$2::UUID
        AND job.tenant_id=$5::UUID AND job.workspace_id=$6::UUID
        AND attempt.scan_job_id=job.id AND attempt.status='FAILED'
        AND attempt.source_binding_id=$2::UUID
        AND attempt.tenant_id=$5::UUID AND attempt.workspace_id=$6::UUID
        AND job.status='REQUESTED' AND job.retry_count=0
        AND job.failure_reason IS NULL AND job.completed_at IS NULL
        AND encode(digest(convert_to(attempt.failure_reason,'UTF8'),'sha256'),'hex')=$4
    `,
      [
        targetContract.reddit.jobId,
        targetContract.reddit.sourceBindingId,
        transactionTimestamp,
        targetContract.reddit.failureReasonSha256,
        dailyScanTerminalRepairScope.tenantId,
        dailyScanTerminalRepairScope.workspaceId,
      ],
      "Reddit job",
    );

    const afterResult = await params.client.query<CapturedTarget>(
      receiptReadbackSql,
      targetValues(targetContract),
    );
    assertTerminalReadback(
      before.targets,
      afterResult.rows,
      transactionTimestamp,
      targetContract,
    );
    const after = new Map(
      afterResult.rows.map((row) => [row.target, row.snapshot]),
    );
    const targets = before.targets.map((row) =>
      Object.freeze({
        target: row.target,
        jobId:
          row.target === "hacker_news"
            ? targetContract.hackerNews.jobId
            : targetContract.reddit.jobId,
        sourceBindingId:
          row.target === "hacker_news"
            ? targetContract.hackerNews.sourceBindingId
            : targetContract.reddit.sourceBindingId,
        before: row.snapshot,
        after: after.get(row.target)!,
      }),
    );
    const receipt = Object.freeze({
      schemaVersion: dailyScanTerminalRepairSchemaVersion,
      confirmation: dailyScanTerminalRepairConfirmation,
      reviewedPreimageSha256: params.reviewedPreimageSha256,
      transactionTimestamp,
      targets,
      restoreEvidenceSha256: digest(
        targets.map((target) => ({
          target: target.target,
          job: target.before.job,
          attempt: target.before.attempt,
          lease: target.before.lease,
        })),
      ),
    });
    await params.persistReceiptBeforeCommit(receipt);
    commitAttempted = true;
    await params.client.query("COMMIT");
    return receipt;
  } catch (error) {
    await params.client.query("ROLLBACK").catch(() => undefined);
    if (!commitAttempted) await params.discardPreparedReceipt();
    throw error;
  }
};

export const reconcileDailyScanTerminalRepairReceipt = async (
  client: DailyScanTerminalRepairSqlClient,
  receipt: DailyScanTerminalRepairReceipt,
  targetContract: DailyScanTerminalRepairTargetContract = dailyScanTerminalRepairTargets,
): Promise<"committed" | "not_committed"> => {
  validateDailyScanTerminalRepairReceipt(receipt, undefined, targetContract);
  try {
    await beginAuthorizedTransaction(client, true);
    const currentResult = await client.query<CapturedTarget>(
      reviewCaptureSql,
      targetValues(targetContract),
    );
    if (currentResult.rows.length !== 2 || receipt.targets.length !== 2) {
      throw new Error(
        "Daily scan terminal repair receipt target set is invalid",
      );
    }
    for (const row of currentResult.rows) {
      assertSnapshotTenantScope(row.snapshot, "receipt reconciliation");
    }
    const receiptByTarget = new Map(
      receipt.targets.map((target) => [target.target, target] as const),
    );
    const currentMatches = (side: "before" | "after"): boolean =>
      currentResult.rows.every((row) => {
        const expected = receiptByTarget.get(row.target)?.[side];
        if (expected === undefined) return false;
        return side === "before"
          ? stable(row.snapshot) === stable(expected)
          : stable(withoutDownstream(row.snapshot)) === stable(expected);
      });
    const outcome = currentMatches("after")
      ? "committed"
      : currentMatches("before")
        ? "not_committed"
        : undefined;
    if (outcome === undefined) {
      throw new Error(
        "Daily scan terminal repair receipt does not match DB state",
      );
    }
    await client.query("ROLLBACK");
    return outcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

export const assertDailyScanTerminalRepairReceipt = (
  value: unknown,
  expectedReviewedPreimageSha256?: string,
): DailyScanTerminalRepairReceipt =>
  validateDailyScanTerminalRepairReceipt(
    value,
    expectedReviewedPreimageSha256,
    dailyScanTerminalRepairTargets,
  );

const validateDailyScanTerminalRepairReceipt = (
  value: unknown,
  expectedReviewedPreimageSha256: string | undefined,
  targetContract: DailyScanTerminalRepairTargetContract,
): DailyScanTerminalRepairReceipt => {
  const receipt = record(value, "receipt");
  requireExactKeys(
    receipt,
    [
      "schemaVersion",
      "confirmation",
      "reviewedPreimageSha256",
      "transactionTimestamp",
      "targets",
      "restoreEvidenceSha256",
    ],
    "receipt",
  );
  if (
    receipt.schemaVersion !== dailyScanTerminalRepairSchemaVersion ||
    receipt.confirmation !== dailyScanTerminalRepairConfirmation ||
    typeof receipt.transactionTimestamp !== "string" ||
    Number.isNaN(Date.parse(receipt.transactionTimestamp)) ||
    !Array.isArray(receipt.targets) ||
    receipt.targets.length !== 2
  ) {
    throw new Error("Daily scan terminal repair receipt envelope is invalid");
  }
  const reviewed = String(receipt.reviewedPreimageSha256);
  const restore = String(receipt.restoreEvidenceSha256);
  requireDigest(reviewed, "receipt preimage");
  requireDigest(restore, "receipt restore evidence");
  if (
    expectedReviewedPreimageSha256 !== undefined &&
    reviewed !== expectedReviewedPreimageSha256
  ) {
    throw new Error("Daily scan terminal repair receipt preimage conflicts");
  }
  const targets = receipt.targets.map((value, index) => {
    const target = record(value, `receipt target ${index}`);
    requireExactKeys(
      target,
      ["target", "jobId", "sourceBindingId", "before", "after"],
      `receipt target ${index}`,
    );
    const expected =
      index === 0
        ? {
            target: "hacker_news",
            jobId: targetContract.hackerNews.jobId,
            sourceBindingId: targetContract.hackerNews.sourceBindingId,
          }
        : {
            target: "reddit",
            jobId: targetContract.reddit.jobId,
            sourceBindingId: targetContract.reddit.sourceBindingId,
          };
    if (
      target.target !== expected.target ||
      target.jobId !== expected.jobId ||
      target.sourceBindingId !== expected.sourceBindingId
    ) {
      throw new Error("Daily scan terminal repair receipt identity is invalid");
    }
    const before = receiptSnapshot(target.before, `target ${index} before`);
    receiptSnapshot(target.after, `target ${index} after`);
    return { target: expected.target, before };
  });
  const computedRestore = digest(
    targets.map(({ target, before }) => ({
      target,
      job: before.job,
      attempt: before.attempt,
      lease: before.lease,
    })),
  );
  if (computedRestore !== restore) {
    throw new Error("Daily scan terminal repair restore evidence is invalid");
  }
  return receipt as DailyScanTerminalRepairReceipt;
};

const receiptSnapshot = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const snapshot = record(value, label);
  record(snapshot.job, `${label} job`);
  record(snapshot.attempt, `${label} attempt`);
  if (snapshot.lease !== null) record(snapshot.lease, `${label} lease`);
  return snapshot;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void => {
  if (stable(Object.keys(value).sort()) !== stable([...expected].sort())) {
    throw new Error(`Daily scan terminal repair ${label} keys are invalid`);
  }
};

const beginAuthorizedTransaction = async (
  client: DailyScanTerminalRepairSqlClient,
  readOnly: boolean,
): Promise<void> => {
  await client.query(
    `BEGIN ISOLATION LEVEL SERIALIZABLE ${readOnly ? "READ ONLY" : "READ WRITE"}`,
  );
  await client.query(
    `SELECT set_config('social_monitor.tenant_id',$1::UUID::TEXT,true),
      set_config('social_monitor.workspace_id',$2::UUID::TEXT,true),
      set_config('social_monitor.system_access','true',true)`,
    [
      dailyScanTerminalRepairScope.tenantId,
      dailyScanTerminalRepairScope.workspaceId,
    ],
  );
  const identity = await client.query<{
    session_user: string;
    current_user: string;
    tenant_id: string;
    workspace_id: string;
    system_access: string;
    transaction_isolation: string;
    transaction_read_only: string;
  }>(`SELECT session_user, current_user,
    current_setting('social_monitor.tenant_id') AS tenant_id,
    current_setting('social_monitor.workspace_id') AS workspace_id,
    current_setting('social_monitor.system_access') AS system_access,
    current_setting('transaction_isolation') AS transaction_isolation,
    current_setting('transaction_read_only') AS transaction_read_only`);
  const row = identity.rows[0];
  if (
    identity.rows.length !== 1 ||
    row?.session_user !== dailyScanTerminalRepairRuntimeRole ||
    row.current_user !== dailyScanTerminalRepairRuntimeRole ||
    row.tenant_id !== dailyScanTerminalRepairScope.tenantId ||
    row.workspace_id !== dailyScanTerminalRepairScope.workspaceId ||
    row.system_access !== "true" ||
    row.transaction_isolation !== "serializable" ||
    row.transaction_read_only !== (readOnly ? "on" : "off")
  ) {
    throw new Error("Daily scan terminal repair runtime authority is invalid");
  }
};

const withoutDownstream = (
  snapshot: Record<string, unknown>,
): Record<string, unknown> => {
  const result = { ...snapshot };
  delete result.downstream;
  return result;
};

const assertCapturedPreimage = (
  rows: readonly CapturedTarget[],
  targetContract: DailyScanTerminalRepairTargetContract,
): void => {
  if (
    rows.length !== 2 ||
    rows[0]?.target !== "hacker_news" ||
    rows[1]?.target !== "reddit"
  ) {
    throw new Error(
      "Daily scan terminal repair requires exactly two target rows",
    );
  }
  for (const row of rows) {
    const job = record(row.snapshot.job, "job");
    const attempt = record(row.snapshot.attempt, "attempt");
    const binding = record(row.snapshot.binding, "binding");
    const source = record(row.snapshot.source, "source");
    const policy = record(row.snapshot.policy, "policy");
    const downstream = record(row.snapshot.downstream, "downstream");
    const decisions = row.snapshot.schedulerDecisions;
    if (
      !Array.isArray(decisions) ||
      decisions.length !== 1 ||
      Object.values(downstream).some((value) => value !== "0" && value !== 0)
    ) {
      throw new Error(
        "Daily scan terminal repair has downstream or scheduler drift",
      );
    }
    if (
      job.retry_count !== 0 ||
      job.source_binding_id !==
        (row.target === "hacker_news"
          ? targetContract.hackerNews.sourceBindingId
          : targetContract.reddit.sourceBindingId)
    ) {
      throw new Error("Daily scan terminal repair job identity drifted");
    }
    assertSnapshotTenantScope(row.snapshot, "preimage");
    if (
      attempt.source_binding_id !== binding.id ||
      policy.source_binding_id !== binding.id ||
      job.scan_policy_id !== policy.id ||
      binding.source_catalog_entry_id !== source.id
    ) {
      throw new Error("Daily scan terminal repair relation scope drifted");
    }
    if (
      source.provider_key !==
      (row.target === "hacker_news" ? "hacker-news" : "reddit")
    ) {
      throw new Error("Daily scan terminal repair provider identity drifted");
    }
    if (row.target === "hacker_news") {
      const lease = record(row.snapshot.lease, "Hacker News lease");
      if (
        job.status !== "ENQUEUED" ||
        attempt.status !== "RUNNING" ||
        attempt.attempt_number !== 1 ||
        attempt.fetched !== 0 ||
        attempt.inserted !== 0 ||
        attempt.skipped_duplicates !== 0 ||
        attempt.projected !== 0 ||
        attempt.failure_reason !== null ||
        lease.id !== targetContract.hackerNews.leaseId
      ) {
        throw new Error("Hacker News repair preimage drifted");
      }
    } else if (
      job.status !== "REQUESTED" ||
      attempt.status !== "FAILED" ||
      row.snapshot.lease !== null ||
      typeof attempt.finished_at !== "string" ||
      typeof attempt.failure_reason !== "string" ||
      digestText(attempt.failure_reason) !==
        targetContract.reddit.failureReasonSha256
    ) {
      throw new Error("Reddit repair preimage drifted");
    }
  }
};

const assertTerminalReadback = (
  beforeRows: readonly CapturedTarget[],
  rows: readonly CapturedTarget[],
  transactionTimestamp: string,
  targetContract: DailyScanTerminalRepairTargetContract,
): void => {
  if (rows.length !== 2)
    throw new Error("Daily scan terminal repair readback is incomplete");
  const before = new Map(beforeRows.map((row) => [row.target, row.snapshot]));
  for (const row of rows) {
    const job = record(row.snapshot.job, "terminal job");
    const attempt = record(row.snapshot.attempt, "terminal attempt");
    assertSnapshotTenantScope(row.snapshot, "terminal readback");
    const original = before.get(row.target);
    if (
      original === undefined ||
      stable(original.binding) !== stable(row.snapshot.binding) ||
      stable(original.source) !== stable(row.snapshot.source) ||
      stable(original.policy) !== stable(row.snapshot.policy) ||
      stable(original.schedulerDecisions) !==
        stable(row.snapshot.schedulerDecisions) ||
      original.failureMetadataSqlNull !== row.snapshot.failureMetadataSqlNull ||
      original.executionMetadataSqlNull !==
        row.snapshot.executionMetadataSqlNull
    ) {
      throw new Error("Daily scan terminal repair changed preserved authority");
    }
    if (
      job.status !== "FAILED" ||
      (row.target === "hacker_news" &&
        job.completed_at !== transactionTimestamp) ||
      row.snapshot.lease !== null
    ) {
      throw new Error("Daily scan terminal repair readback is not terminal");
    }
    if (
      row.target === "hacker_news" &&
      (attempt.status !== "FAILED" ||
        attempt.finished_at !== transactionTimestamp)
    ) {
      throw new Error("Hacker News terminal readback is invalid");
    }
    if (
      row.target === "reddit" &&
      (attempt.status !== "FAILED" ||
        stable(original.attempt) !== stable(row.snapshot.attempt) ||
        digestText(String(attempt.failure_reason)) !==
          targetContract.reddit.failureReasonSha256)
    ) {
      throw new Error("Reddit terminal readback is invalid");
    }
  }
};

const exactUpdate = async (
  client: DailyScanTerminalRepairSqlClient,
  sql: string,
  values: readonly unknown[],
  label: string,
): Promise<void> => {
  const result = await client.query(sql, values);
  if (result.rowCount !== 1)
    throw new Error(`${label} CAS wrote ${result.rowCount ?? 0} rows`);
};
const targetValues = (
  targetContract: DailyScanTerminalRepairTargetContract = dailyScanTerminalRepairTargets,
): readonly string[] => [
  targetContract.hackerNews.jobId,
  targetContract.hackerNews.sourceBindingId,
  targetContract.reddit.jobId,
  targetContract.reddit.sourceBindingId,
  dailyScanTerminalRepairScope.tenantId,
  dailyScanTerminalRepairScope.workspaceId,
];
const assertSnapshotScope = (
  value: Record<string, unknown>,
  label: string,
): void => {
  if (
    value.tenant_id !== dailyScanTerminalRepairScope.tenantId ||
    value.workspace_id !== dailyScanTerminalRepairScope.workspaceId
  ) {
    throw new Error(`Daily scan terminal repair ${label} scope drifted`);
  }
};
const assertSnapshotTenantScope = (
  snapshot: Record<string, unknown>,
  label: string,
): void => {
  for (const relation of ["job", "attempt", "binding", "policy"] as const) {
    assertSnapshotScope(
      record(snapshot[relation], relation),
      `${label} ${relation}`,
    );
  }
  if (snapshot.lease !== null) {
    assertSnapshotScope(record(snapshot.lease, "lease"), `${label} lease`);
  }
  if (!Array.isArray(snapshot.schedulerDecisions)) {
    throw new Error(`Daily scan terminal repair ${label} decisions drifted`);
  }
  for (const decision of snapshot.schedulerDecisions) {
    assertSnapshotScope(record(decision, "decision"), `${label} decision`);
  }
};
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Daily scan terminal repair ${label} is invalid`);
  }
  return value as Record<string, unknown>;
};
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const digest = (value: unknown): string =>
  createHash("sha256").update(stable(value), "utf8").digest("hex");
const digestText = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
const requireDigest = (value: string, label: string): void => {
  if (!/^[0-9a-f]{64}$/u.test(value))
    throw new Error(`${label} SHA-256 is invalid`);
};
