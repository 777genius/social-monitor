import { resolveReaderValueCleanupOptions } from './reader-value-provider-tokens';

describe('reader-value retention composition', () => {
  it.each([undefined, '', '{}', '["invalid"]', 'not-json'])('fails closed on absent/invalid holds %s', (value) => {
    expect(resolveReaderValueCleanupOptions({ READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS: value }).policy.retentionHoldWorkspaceIds).toBeNull();
  });
  it('requires an explicit empty list and a separate scope-erasure decision', () => {
    const options = resolveReaderValueCleanupOptions({ READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS: '[]' });
    expect(options.policy).toEqual({ version: 'reader-value-retention.v1', retentionHoldWorkspaceIds: [], eraseRevokedScopes: false });
    expect(resolveReaderValueCleanupOptions({ READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS: '[]',
      READER_VALUE_ERASE_REVOKED_SCOPES: 'true' }).policy.eraseRevokedScopes).toBe(true);
  });
  it('hashes the effective canonical policy and records its authoritative configuration source', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const first = resolveReaderValueCleanupOptions({ READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS: JSON.stringify([id, id]) });
    const second = resolveReaderValueCleanupOptions({ READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS: JSON.stringify([id]) });
    expect(first.policySha256).toBe(second.policySha256);
    expect(first.policySource).toBe('READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS');
    expect(first.policySha256).not.toBe(resolveReaderValueCleanupOptions({}).policySha256);
  });
});
