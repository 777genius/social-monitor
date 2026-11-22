import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHnArchiveSnapshot } from './hn-archive-snapshot.js';

const scope = { tenantId: '10000000-0000-4000-8000-000000000001', workspaceId: '10000000-0000-4000-8000-000000000002',
  sourceBindingId: '10000000-0000-4000-8000-000000000003', interestId: '10000000-0000-4000-8000-000000000004',
  scanPolicyId: '10000000-0000-4000-8000-000000000005' };
const snapshot = () => ({ schemaVersion: 1, observedAt: '2026-11-18T00:00:00Z', scope,
  config: { query: 'synthetic' }, existingIds: ['hn:1'] });

test('validates snapshot scope and rejects duplicated or malformed IDs', () => {
  assert.deepEqual([...parseHnArchiveSnapshot(snapshot()).existingIds], ['hn:1']);
  assert.throws(() => parseHnArchiveSnapshot({ ...snapshot(), existingIds: ['hn:1', 'hn:1'] }));
  assert.throws(() => parseHnArchiveSnapshot({ ...snapshot(), existingIds: ['hn:01'] }));
  assert.throws(() => parseHnArchiveSnapshot({ ...snapshot(), scope: { ...scope, workspaceId: 'invalid' } }));
  assert.throws(() => parseHnArchiveSnapshot({ ...snapshot(), observedAt: '2999-01-01T00:00:00Z' }));
});
