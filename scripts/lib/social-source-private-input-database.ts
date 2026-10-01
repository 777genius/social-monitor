import { Pool } from 'pg';
import { approvedScope, refuse, validateSnapshot, type SourceSnapshot } from './social-source-private-input-contract';

/** Same pg/scoped reader composition as run-hn-rss-recovery; never a config/credential resolver. */
export interface ScopedReadClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  on(event: 'error', listener: () => void): void;
  release(): void;
}
export interface ScopedReadPool { connect(): Promise<ScopedReadClient>; end(): Promise<void> }
export type SnapshotReader = () => Promise<readonly SourceSnapshot[]>;

export const scopedSnapshotSql = `
SELECT jsonb_build_object(
  'provider', sce.provider_key,
  'scope', jsonb_build_object('tenantId', sb.tenant_id::text, 'workspaceId', sb.workspace_id::text,
    'interestId', sb.interest_id::text, 'sourceBindingId', sb.id::text, 'scanPolicyId', sp.id::text),
  'catalogId', sce.id::text, 'interestQuery', CASE WHEN octet_length(i.query) <= 16384 THEN i.query END,
  'config', CASE WHEN octet_length(sb.config::text) <= 65536 THEN sb.config END,
  'policy', jsonb_build_object('id', sp.id::text, 'intervalSeconds', sp.interval_seconds,
    'freshnessSeconds', sp.freshness_seconds, 'retryBudget', sp.retry_budget, 'nextRunAt', sp.next_run_at::text),
  'capability', jsonb_build_object('id', cp.id::text, 'sourceId', cp.source_id::text,
    'version', cp.version, 'schemaVersion', cp.schema_version,
    'config', CASE WHEN octet_length(cp.config::text) <= 32768 THEN cp.config END)
)::text AS snapshot,
  (t.id IS NOT NULL AND w.id IS NOT NULL AND i.id IS NOT NULL AND sp.id IS NOT NULL AND cp.id IS NOT NULL
    AND (SELECT count(*) FROM scan_policies p WHERE p.source_binding_id = sb.id
      AND p.tenant_id = sb.tenant_id AND p.workspace_id = sb.workspace_id) = 1
    AND (SELECT count(*) FROM capability_profiles c WHERE c.source_id = sce.id
      AND c.version = sb.capability_profile_version) = 1) AS eligible
FROM source_bindings sb
JOIN source_catalog_entries sce ON sce.id = sb.source_catalog_entry_id
LEFT JOIN tenants t ON t.id = sb.tenant_id AND t.deleted_at IS NULL
LEFT JOIN workspaces w ON w.id = sb.workspace_id AND w.tenant_id = sb.tenant_id AND w.deleted_at IS NULL
LEFT JOIN interests i ON i.id = sb.interest_id AND i.tenant_id = sb.tenant_id AND i.workspace_id = sb.workspace_id
  AND i.status = 'ENABLED' AND i.deleted_at IS NULL
LEFT JOIN scan_policies sp ON sp.source_binding_id = sb.id AND sp.tenant_id = sb.tenant_id AND sp.workspace_id = sb.workspace_id
LEFT JOIN capability_profiles cp ON cp.source_id = sce.id AND cp.version = sb.capability_profile_version
WHERE sb.tenant_id = $1::uuid AND sb.workspace_id = $2::uuid
  AND sb.status = 'ENABLED' AND sb.deleted_at IS NULL AND sce.provider_key IN ('reddit', 'rss')
ORDER BY sce.provider_key, sb.id LIMIT 5`;

// Compare decimal JSON values without first rounding the database's numeric token to a JS number.
// Normalization is validation only; neither snapshots nor consumer requests receive rewritten values.
function decimalValue(token: string): string {
  if (token.length > 128) return refuse('database');
  const parts = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(token);
  if (parts === null) return refuse('database');
  let exponent = Number(parts[4] ?? 0) - (parts[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 400) return refuse('database');
  let digits = `${parts[2]}${parts[3] ?? ''}`.replace(/^0+/u, '');
  if (digits === '') return '0';
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return `${parts[1]}${digits}e${exponent}`;
}
function parseStoredSnapshot(value: unknown): unknown {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 262_144) return refuse('database');
  return JSON.parse(value, (_key: string, entry: unknown, context?: { source?: string }): unknown => {
    if (typeof entry === 'number' && (!Number.isFinite(entry) || Object.is(entry, -0) ||
      typeof context?.source !== 'string' || decimalValue(context.source) !== decimalValue(JSON.stringify(entry)))) refuse('database');
    return entry;
  }) as unknown;
}

export async function readScopedSnapshots(pool: ScopedReadPool): Promise<readonly SourceSnapshot[]> {
  let client: ScopedReadClient | undefined;
  let clientFailed = false;
  try {
    client = await pool.connect();
    // pg removes its idle client listener on checkout; absorb connection errors without raw diagnostics.
    client.on('error', () => { clientFailed = true; });
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SELECT set_config('social_monitor.tenant_id', $1, true),
      set_config('social_monitor.workspace_id', $2, true), set_config('social_monitor.system_access', 'false', true),
      set_config('statement_timeout', '5000', true), set_config('lock_timeout', '1000', true),
      set_config('idle_in_transaction_session_timeout', '5000', true)`, [approvedScope.tenantId, approvedScope.workspaceId]);
    const result = await client.query(scopedSnapshotSql, [approvedScope.tenantId, approvedScope.workspaceId]);
    if (clientFailed) refuse('database');
    if (result.rows.length !== 2 || result.rows.some((row) => row.eligible !== true)) refuse('scope');
    const snapshots = result.rows.map((row) => validateSnapshot(parseStoredSnapshot(row.snapshot)));
    if (snapshots.filter((row) => row.provider === 'reddit').length !== 1 ||
      snapshots.filter((row) => row.provider === 'rss').length !== 1) refuse('scope');
    await client.query('COMMIT');
    if (clientFailed) refuse('database');
    return snapshots;
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    // Even parser and pg errors contain no rows, query text, IDs, or credential-bearing connection details.
    return refuse('database');
  } finally {
    try { client?.release(); await pool.end(); } catch { refuse('database'); }
    if (clientFailed) refuse('database');
  }
}

/** Construction alone performs no connection or environment/credential read. */
export function databaseSnapshotReader(databaseUrl: string): SnapshotReader {
  return async () => {
    try {
      const pool = new Pool({ connectionString: databaseUrl, min: 0, max: 1,
        connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
      let connectionFailed = false;
      // An idle pg pool error must never become an unhandled raw diagnostic.
      pool.on('error', () => { connectionFailed = true; });
      const rows = await readScopedSnapshots(pool);
      if (connectionFailed) refuse('database');
      return rows;
    } catch { return refuse('database'); }
  };
}
