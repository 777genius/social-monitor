import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRetainedCapturePlan } from './materialize-retained-source-captures';

describe('retained capture operator input custody', () => {
  let root: string;
  beforeEach(() => { root = realpathSync(mkdtempSync(join(tmpdir(),'retained-capture-plan-'))); chmodSync(root,0o700); });
  afterEach(() => rmSync(root,{ recursive: true,force: true }));
  const plan = { tenantId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',interestId: '00000000-0000-4000-8000-000000000003',
    periodStartedAt: '2026-09-29T00:00:00Z',periodEndedAt: '2026-09-30T00:00:00Z',
    targets: [{ sourceItemId: '00000000-0000-4000-8000-000000000004',expectedRowSha256: 'a'.repeat(64) }] };
  function write(value: unknown = plan) {
    const bytes = Buffer.from(JSON.stringify(value)); const path = join(root,'plan.json');
    writeFileSync(path,bytes,{ mode: 0o600 });
    return { path,digest: createHash('sha256').update(bytes).digest('hex') };
  }
  it('reads only exact pinned private plan without opening a database', () => {
    const p = write(); expect(readRetainedCapturePlan(p.path,p.digest)).toEqual(plan);
  });
  it('refuses changed hash, public mode, symlink and unbounded input', () => {
    const p = write();
    expect(() => readRetainedCapturePlan(p.path,'b'.repeat(64))).toThrow('Plan changed');
    chmodSync(p.path,0o644); expect(() => readRetainedCapturePlan(p.path,p.digest)).toThrow('custody');
    chmodSync(p.path,0o600); const link = join(root,'link'); symlinkSync(p.path,link);
    expect(() => readRetainedCapturePlan(link,p.digest)).toThrow();
    writeFileSync(p.path,' '.repeat(131_073)); expect(() => readRetainedCapturePlan(p.path,p.digest)).toThrow('custody');
  });
  it('refuses unknown plan fields and caller-supplied acquisition clock', () => {
    const p = write({ ...plan,availableAt: '2026-09-29T00:00:00Z' });
    expect(() => readRetainedCapturePlan(p.path,p.digest)).toThrow('Invalid plan');
  });
});
