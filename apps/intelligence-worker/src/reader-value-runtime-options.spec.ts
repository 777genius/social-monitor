import { resolveReaderValueRuntimeOptions } from './reader-value-runtime-options';

const scopes = [{ tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  interestId: '44444444-4444-4444-8444-444444444444' }];
const configured = {
  RELEVANCE_PERSISTENCE: 'prisma', READER_VALUE_SCORING_LOOP: 'enabled', READER_VALUE_DISCOVERY_SCOPES: JSON.stringify(scopes),
  READER_VALUE_BACKFILL_FROM: '2026-09-01T00:00:00.000Z', READER_VALUE_MODE: 'jev_shadow',
  SUMMARY_PERSISTENCE: 'prisma',
};

describe('reader-value runtime options', () => {
  it('defaults to primary for all active interests with a bounded lookback and durable dependencies', () => {
    expect(() => resolveReaderValueRuntimeOptions({})).toThrow(/RELEVANCE_PERSISTENCE/u);
    expect(resolveReaderValueRuntimeOptions({ NODE_ENV: 'test' })).toMatchObject({
      mode: 'legacy_v2', scoringLoopEnabled: false });
    expect(resolveReaderValueRuntimeOptions({ RELEVANCE_PERSISTENCE: 'prisma',
      SUMMARY_PERSISTENCE: 'prisma' })).toMatchObject({ mode: 'jev_primary_v3',
      discoverAllActiveScopes: true, discoveryScopes: [], scoringLoopEnabled: true,
      backfillFrom: expect.any(String) });
  });
  it('retains bounded durable drain after rollback without discovering new scope', () => {
    expect(resolveReaderValueRuntimeOptions({ ...configured, READER_VALUE_MODE: 'legacy_v2' })).toMatchObject({
      mode: 'legacy_v2', discoveryScopes: [], backfillFrom: null, drainFrozenInputs: true,
      scoringLoopEnabled: true, tickMs: 10_000, discoveryLimit: 100, scopePageLimit: 1, concurrency: 2,
    });
  });
  it('requires durable enabled scoped discovery and an explicit valid window', () => {
    expect(resolveReaderValueRuntimeOptions(configured).discoveryScopes).toEqual(scopes);
    for (const patch of [
      { RELEVANCE_PERSISTENCE: 'in-memory' }, { READER_VALUE_SCORING_LOOP: 'disabled' },
      { READER_VALUE_DISCOVERY_SCOPES: '[]' },
      { READER_VALUE_BACKFILL_FROM: '2026-02-30T00:00:00.000Z' }, { READER_VALUE_MODE: 'unknown' },
    ]) expect(() => resolveReaderValueRuntimeOptions({ ...configured, ...patch })).toThrow();
  });
  it('preserves the configured microsecond boundary instead of rounding it through Date', () => {
    const boundary = '2026-09-01T00:00:00.123456Z';
    expect(resolveReaderValueRuntimeOptions({ ...configured, READER_VALUE_BACKFILL_FROM: boundary }).backfillFrom).toBe(boundary);
  });
  it('keeps shadow discovery explicitly scoped despite the primary all-interest default', () => {
    expect(() => resolveReaderValueRuntimeOptions({ ...configured,
      READER_VALUE_DISCOVERY_SCOPES: undefined })).toThrow(/shadow/u);
    expect(() => resolveReaderValueRuntimeOptions({ ...configured,
      READER_VALUE_BACKFILL_FROM: undefined })).toThrow(/shadow/u);
  });
  it('rejects queue-only primary and a poller restricted to another scope', () => {
    const primary = { ...configured, READER_VALUE_MODE: 'jev_primary_v3', INTELLIGENCE_SUMMARY_QUEUE_READER: 'rabbitmq' };
    expect(resolveReaderValueRuntimeOptions(primary).mode).toBe('jev_primary_v3');
    expect(() => resolveReaderValueRuntimeOptions({ ...primary,
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP: 'disabled' })).toThrow(/poller/u);
    expect(() => resolveReaderValueRuntimeOptions({ ...primary,
      SUMMARY_PERSISTENCE: 'in-memory',
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP: 'enabled' })).toThrow(/SUMMARY_PERSISTENCE/u);
    expect(resolveReaderValueRuntimeOptions({ ...primary,
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP: 'enabled' }).mode).toBe('jev_primary_v3');
    expect(() => resolveReaderValueRuntimeOptions({ ...primary, INTELLIGENCE_READER_SUMMARY_JOB_LOOP: 'enabled',
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP_TENANT_ID: scopes[0]!.tenantId,
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP_WORKSPACE_ID: '33333333-3333-4333-8333-333333333333',
    })).toThrow(/cover every/u);
  });
  it.each(['{}', '[null]', '[{"tenantId":"bad","workspaceId":"bad","interestId":"bad"}]',
    '[{"tenantId":"*"}]',
    '[{"tenantId":"11111111-1111-4111-8111-111111111111","workspaceId":"22222222-2222-4222-8222-222222222222"}]'])(
    'rejects malformed/wildcard scopes %s', (value) => {
      expect(() => resolveReaderValueRuntimeOptions({ ...configured, READER_VALUE_DISCOVERY_SCOPES: value })).toThrow();
    },
  );
});
