export type RecoveryV4ReplaySnapshotClient = Readonly<{
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly T[] }>>;
}>;

export const protectedDayDigest = async (
  client: RecoveryV4ReplaySnapshotClient,
): Promise<string> => {
  const result = await client.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(jsonb_build_array(
      requested_utc_date, btrim(canonical_sha256)) ORDER BY requested_utc_date,
      recovery_id), '[]'::JSONB)::TEXT, 'UTF8')), 'hex') AS digest
    FROM public.reader_summary_production_recovery_days
    WHERE requested_utc_date IN (DATE '2026-07-21', DATE '2026-07-22')
  `);
  return result.rows[0]?.digest ?? "";
};

export type FullReplayDurableSnapshot = Readonly<{
  bytes: string;
  byteLength: string;
  digest: string;
  rowCount: string;
  tableCount: string;
}>;

export const fullReplayDurableSnapshot = async (
  client: RecoveryV4ReplaySnapshotClient,
  tenant: string,
  workspace: string,
): Promise<FullReplayDurableSnapshot> => {
  const result = await client.query<FullReplayDurableSnapshot>(`WITH state AS (SELECT jsonb_build_object('plans',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_daily_canonical_recovery_v4_plans row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'authorities',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_daily_canonical_recovery_v4_authorities row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'leases',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_daily_canonical_recovery_v4_leases row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'retries',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_daily_canonical_recovery_v4_ambiguity_retries row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'artifacts',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_artifacts row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'jobs',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_jobs row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'publications',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_publications row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'publicationSlots',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_publication_slots row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'publicationEvidence',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.reader_summary_weekly_publication_evidence row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'outboxEvents',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::TEXT),'[]'::JSONB) FROM public.outbox_events row WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID)) AS bytes), inventory AS (SELECT jsonb_build_object('plans',(SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_plans WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'authorities',(SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_authorities WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'leases',(SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_leases WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'retries',(SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_ambiguity_retries WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'artifacts',(SELECT count(*) FROM public.reader_summary_artifacts WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'jobs',(SELECT count(*) FROM public.reader_summary_jobs WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'publications',(SELECT count(*) FROM public.reader_summary_publications WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'publicationSlots',(SELECT count(*) FROM public.reader_summary_publication_slots WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'publicationEvidence',(SELECT count(*) FROM public.reader_summary_weekly_publication_evidence WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID),'outboxEvents',(SELECT count(*) FROM public.outbox_events WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID)) AS counts) SELECT bytes::TEXT AS bytes,octet_length(convert_to(bytes::TEXT,'UTF8'))::TEXT AS "byteLength",encode(sha256(convert_to(bytes::TEXT,'UTF8')),'hex') AS digest,(SELECT count(*)::TEXT FROM jsonb_object_keys(bytes)) AS "tableCount",(SELECT sum(value::BIGINT)::TEXT FROM jsonb_each_text(counts)) AS "rowCount" FROM state,inventory`, [tenant, workspace]);
  const row = result.rows[0]; if (row === undefined || !/^[0-9a-f]{64}$/u.test(row.digest) || !/^[0-9]+$/u.test(row.byteLength) || !/^[0-9]+$/u.test(row.rowCount) || row.tableCount !== "10") throw new Error("full replay durable snapshot is invalid"); return row;
};

export const assertFullReplayDurableSnapshot = async (
  client: RecoveryV4ReplaySnapshotClient,
  tenant: string,
  workspace: string,
  executeAll: () => Promise<Readonly<{ kind: string }>>,
  runtimeCallCount: () => number,
  expectedRuntimeCallCount: number,
): Promise<void> => {
  const beforeReplay = await fullReplayDurableSnapshot(client, tenant, workspace);
  const replay = await executeAll();
  const afterReplay = await fullReplayDurableSnapshot(client, tenant, workspace);
  assert(
    replay.kind === "caught_up" && runtimeCallCount() === expectedRuntimeCallCount,
    "fenced canonical recovery replay invoked the subscription runtime again",
  );
  assert(afterReplay.bytes === beforeReplay.bytes && afterReplay.byteLength === beforeReplay.byteLength && afterReplay.digest === beforeReplay.digest && afterReplay.rowCount === beforeReplay.rowCount && afterReplay.tableCount === beforeReplay.tableCount, `fenced canonical recovery replay mutated durable state: ${JSON.stringify({ beforeReplay, afterReplay })}`);
};

const assert: (condition: unknown, message: string) => asserts condition =
  (condition, message) => {
    if (!condition) throw new Error(message);
  };
