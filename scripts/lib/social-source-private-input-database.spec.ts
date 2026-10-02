import { approvedScope } from './social-source-private-input-contract';
import type * as Pg from 'pg';
// Spy on the CommonJS constructor, rather than TypeScript's immutable namespace getters.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require('pg') as typeof Pg;
import { databaseSnapshotReader, readScopedSnapshots, scopedSnapshotSql } from './social-source-private-input-database';
import { fakeScopedPool, syntheticSnapshots, syntheticId } from './social-source-private-input-fixtures.spec-support';

describe('one bounded readonly exact-scope transaction', () => {
  it('constructs only one bounded pg connection with an error listener and performs no IO until invoked', async () => {
    const rows = syntheticSnapshots();
    const fake = fakeScopedPool(rows.map((snapshot) => ({ eligible: true, snapshot })));
    let idleFailure: (() => void) | undefined;
    const on = jest.fn((_event: string, listener: () => void) => { idleFailure = listener; });
    const constructor = jest.spyOn(pg, 'Pool').mockImplementation(() => ({ ...fake.pool, on }) as unknown as Pg.Pool);
    try {
      const reader = databaseSnapshotReader('synthetic-db-composition');
      expect(constructor).not.toHaveBeenCalled(); expect(fake.calls).toHaveLength(0);
      expect(await reader()).toEqual(rows);
      expect(constructor).toHaveBeenCalledWith({ connectionString: 'synthetic-db-composition', min: 0, max: 1,
        connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
      expect(on).toHaveBeenCalledWith('error', expect.any(Function));
      fake.pool.end = async () => { idleFailure?.(); };
      await expect(reader()).rejects.toThrow(/^private_input_refused:database$/u);
      constructor.mockImplementation(() => { throw new Error('synthetic constructor connection details'); });
      await expect(reader()).rejects.toThrow(/^private_input_refused:database$/u);
    } finally { constructor.mockRestore(); }
  });
  it('sets REPEATABLE READ, scoped local settings, timeouts, and closes once without a credential resolver', async () => {
    const expected = syntheticSnapshots();
    const fake = fakeScopedPool(expected.map((snapshot) => ({ eligible: true, snapshot })));
    expect(await readScopedSnapshots(fake.pool)).toEqual(expected);
    expect(fake.calls[0]?.text).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(fake.calls[1]?.values).toEqual(['00000000-0000-7000-8000-000000006101', '00000000-0000-7000-8000-000000006102']);
    expect(fake.calls[1]?.text).toContain("set_config('social_monitor.system_access', 'false', true)");
    for (const setting of ['statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout']) expect(fake.calls[1]?.text).toContain(setting);
    expect(fake.calls[2]?.values).toEqual([approvedScope.tenantId, approvedScope.workspaceId]);
    expect(fake.calls.at(-1)?.text).toBe('COMMIT');
    expect(fake.release).toHaveBeenCalledTimes(1); expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.calls.map((call) => call.text).join('\n')).not.toMatch(/source_credentials|source_credential_secrets|INSERT|UPDATE|DELETE|system_access', 'true'/u);
  });
  it('pins every independently required join, deletion/status check and policy field in the actual SQL', () => {
    const sql = scopedSnapshotSql.replace(/\s+/gu, ' ');
    for (const required of [
      'sce.id = sb.source_catalog_entry_id', 't.id = sb.tenant_id AND t.deleted_at IS NULL',
      'w.id = sb.workspace_id AND w.tenant_id = sb.tenant_id AND w.deleted_at IS NULL',
      'i.id = sb.interest_id AND i.tenant_id = sb.tenant_id AND i.workspace_id = sb.workspace_id',
      "i.status = 'ENABLED' AND i.deleted_at IS NULL", 'sp.source_binding_id = sb.id AND sp.tenant_id = sb.tenant_id AND sp.workspace_id = sb.workspace_id',
      'cp.source_id = sce.id AND cp.version = sb.capability_profile_version',
      'sb.tenant_id = $1::uuid AND sb.workspace_id = $2::uuid', "sb.status = 'ENABLED' AND sb.deleted_at IS NULL",
      "sce.provider_key IN ('reddit', 'rss')", 'FROM scan_policies p WHERE p.source_binding_id = sb.id',
      'p.tenant_id = sb.tenant_id AND p.workspace_id = sb.workspace_id) = 1',
      'FROM capability_profiles c WHERE c.source_id = sce.id', 'c.version = sb.capability_profile_version) = 1',
      'sp.interval_seconds', 'sp.freshness_seconds', 'sp.retry_budget', 'sp.next_run_at::text', 'LIMIT 5',
    ]) expect(sql).toContain(required);
    expect(sql).not.toMatch(/sp.status|credential|SELECT \*/iu);
    expect(sql).toContain('LEFT JOIN scan_policies'); // Missing-policy candidates cannot disappear before cardinality checking.
    expect(sql).toContain(')::text AS snapshot'); // pg must not round JSON numbers before our validation.
  });
  it('preserves representable stored decimal values and array ordering from raw JSON text', async () => {
    const rows = syntheticSnapshots();
    rows[0]!.capability.config.calibration = [0.1, 1.25, 1000, Number.MAX_SAFE_INTEGER];
    const serialized = rows.map((snapshot) => ({ eligible: true, snapshot: JSON.stringify(snapshot)
      .replace('[0.1,1.25,1000,9007199254740991]', '[0.1000,125e-2,1e3,9007199254740991]') }));
    expect(await readScopedSnapshots(fakeScopedPool(serialized).pool)).toEqual(rows);
  });
  it.each(['9007199254740993', '0.10000000000000000001', '1.23456789012345678', '1e-999', '1e999', '-0'])(
    'refuses stored JSON number %s that cannot survive private JSON serialization unchanged', async (number) => {
      const rows = syntheticSnapshots(); rows[0]!.capability.config.calibration = 0.1;
      const serialized = rows.map((snapshot) => ({ eligible: true, snapshot: JSON.stringify(snapshot)
        .replace('"calibration":0.1', `"calibration":${number}`) }));
      const fake = fakeScopedPool(serialized);
      await expect(readScopedSnapshots(fake.pool)).rejects.toThrow(/^private_input_refused:database$/u);
      expect(fake.calls.at(-1)?.text).toBe('ROLLBACK');
      expect(fake.calls.some((call) => call.text === 'COMMIT')).toBe(false);
    });
  it('fails closed on an engine that omits JSON numeric source tokens', async () => {
    const originalParse = JSON.parse;
    const parse = jest.spyOn(JSON, 'parse').mockImplementation((text: string,
      reviver?: (key: string, value: unknown) => unknown): unknown => originalParse(text,
      reviver === undefined ? undefined : (key: string, value: unknown) => reviver(key, value)) as unknown);
    try {
      const fake = fakeScopedPool(syntheticSnapshots().map((snapshot) => ({ eligible: true, snapshot })));
      await expect(readScopedSnapshots(fake.pool)).rejects.toThrow(/^private_input_refused:database$/u);
      expect(fake.calls.at(-1)?.text).toBe('ROLLBACK');
    } finally { parse.mockRestore(); }
  });
  it.each([[], [syntheticSnapshots()[0]], [syntheticSnapshots()[0], syntheticSnapshots()[0]],
    [...syntheticSnapshots(), syntheticSnapshots()[1]]].map((rows) => ({ rows })))('refuses missing or duplicate provider/binding/policy rows', async ({ rows }) => {
    const fake = fakeScopedPool(rows.map((snapshot) => ({ eligible: true, snapshot })));
    await expect(readScopedSnapshots(fake.pool)).rejects.toThrow(/^private_input_refused:database$/u);
    expect(fake.calls.at(-1)?.text).toBe('ROLLBACK'); expect(fake.calls.some((call) => call.text === 'COMMIT')).toBe(false);
  });
  it('refuses false joined eligibility even when config and IDs are otherwise valid', async () => {
    const fake = fakeScopedPool(syntheticSnapshots().map((snapshot, index) => ({ eligible: index !== 0, snapshot })));
    await expect(readScopedSnapshots(fake.pool)).rejects.toThrow('database');
    expect(fake.calls.at(-1)?.text).toBe('ROLLBACK');
  });
  it.each([
    (row: ReturnType<typeof syntheticSnapshots>[number]) => ({ ...row, scope: { ...row.scope, tenantId: syntheticId(9990) } }),
    (row: ReturnType<typeof syntheticSnapshots>[number]) => ({ ...row, policy: { ...row.policy, id: syntheticId(9990) } }),
    (row: ReturnType<typeof syntheticSnapshots>[number]) => ({ ...row, capability: { ...row.capability, sourceId: syntheticId(9990) } }),
    (row: ReturnType<typeof syntheticSnapshots>[number]) => ({ ...row, config: { protectedReference: 'synthetic' } }),
  ])('refuses malformed/mismatched pins even if an injected database claims eligibility', async (mutate) => {
    const rows = syntheticSnapshots(); rows[0] = mutate(rows[0]!);
    await expect(readScopedSnapshots(fakeScopedPool(rows.map((snapshot) => ({ eligible: true, snapshot }))).pool)).rejects.toThrow('database');
  });
  it('masks raw pg errors and releases/ends a failed connection', async () => {
    const fake = fakeScopedPool([]);
    const connect = fake.pool.connect;
    fake.pool.connect = async () => { const client = await connect(); client.query = async () => { throw new Error('synthetic raw query row'); }; return client; };
    await expect(readScopedSnapshots(fake.pool)).rejects.toThrow(/^private_input_refused:database$/u);
    expect(fake.release).toHaveBeenCalledTimes(1); expect(fake.end).toHaveBeenCalledTimes(1);
  });
  it.each(['selected', 'committed', 'closing'])('absorbs checked-out pg client errors while %s and refuses authority', async (phase) => {
    const fake = fakeScopedPool(syntheticSnapshots().map((snapshot) => ({ eligible: true, snapshot })));
    const emit = (): void => { const listener = fake.on.mock.calls.find(([event]) => event === 'error')?.[1] as (() => void) | undefined; listener?.(); };
    const connect = fake.pool.connect;
    fake.pool.connect = async () => {
      const client = await connect(); const query = client.query;
      client.query = async (text, values) => {
        const result = await query(text, values);
        if ((phase === 'selected' && text === scopedSnapshotSql) || (phase === 'committed' && text === 'COMMIT')) emit();
        return result;
      };
      return client;
    };
    if (phase === 'closing') fake.end.mockImplementation(async () => { emit(); });
    await expect(readScopedSnapshots(fake.pool)).rejects.toThrow(/^private_input_refused:database$/u);
    expect(fake.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(fake.release).toHaveBeenCalledTimes(1); expect(fake.end).toHaveBeenCalledTimes(1);
    if (phase === 'selected') expect(fake.calls.some((call) => call.text === 'COMMIT')).toBe(false);
  });
});
