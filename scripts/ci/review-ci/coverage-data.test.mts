import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { test } from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml') as {
  load(source: string): unknown;
};
type Workflow = { jobs: Record<string, { steps: Array<{ run?: string }> }> };
const coverage = load(readFileSync('.github/workflows/coverage.yml', 'utf8')) as Workflow;
const script = (workflow: Workflow, job: string, index = 0): string => {
  const command = workflow.jobs[job]?.steps[index]?.run;
  assert.ok(typeof command === 'string');
  return command;
};
const metadata = script(coverage, 'coverage_artifacts');
const ownShard = script(coverage, 'backend_unit_coverage', 1);
const scratch = resolve('node_modules/.cicd-evidence');
const fixture = (label: string, run: (directory: string) => void): void => {
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(join(scratch, label));
  try { run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
};
const shell = (command: string, directory: string, env: Record<string, string> = {}) => {
  const result = spawnSync('bash', ['-c', command], { cwd: directory, timeout: 5000,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env }, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.notEqual(result.status, null, result.stderr);
  return result;
};
type Artifact = { id: number; name: string; size_in_bytes: number; expired: boolean; expires_at: string;
  workflow_run: { id: number; head_sha: string } };
const runId = 12345;
const head = 'a'.repeat(40);
const artifacts = (): Artifact[] => Array.from({ length: 6 }, (_, i) => ({
  id: 100 + i, name: `backend-unit-coverage-${i + 1}`, size_in_bytes: 200,
  expired: false, expires_at: '2100-01-01T00:00:00Z', workflow_run: { id: runId, head_sha: head },
}));
const page = (items: unknown[]) => [{ total_count: items.length, artifacts: items }];
const first = (items: Artifact[]): Artifact => items[0]!;

// The real gh invocation is replaced at its process boundary. The real jq
// program still evaluates JSON; tests never need tokens or network access.
const metadataResult = (directory: string, source: unknown, apiExit = 0) => {
  writeFileSync(join(directory, 'fixture.json'), typeof source === 'string' ? source : JSON.stringify(source));
  const result = shell(`gh() {
    printf '%s\\n' "$@" > api-arguments
    cat fixture.json
    return ${apiExit}
  }
  ${metadata}`, directory, { GH_REPO: 'fixture/repo', RUN_ID: String(runId), HEAD_SHA: head });
  assert.deepEqual(readFileSync(join(directory, 'api-arguments'), 'utf8').trim().split('\n'),
    ['api', '--paginate', '--slurp', `/repos/fixture/repo/actions/runs/${runId}/artifacts?per_page=100`]);
  return result;
};

test('coverage metadata accepts six artifacts across pages with unrelated producer reports', () => {
  fixture('coverage-metadata-', (directory) => {
    const items = artifacts();
    assert.equal(metadataResult(directory, page(items)).status, 0);
    const report = { ...first(items), id: 500, name: 'backend-unit-report-1' };
    assert.equal(metadataResult(directory, [
      { total_count: 7, artifacts: [report, ...items.slice(0, 2)] },
      { total_count: 7, artifacts: items.slice(2) },
    ]).status, 0);
  });
});
const badArtifacts: Array<[string, (items: Artifact[]) => void]> = [
  ['missing sixth', (items) => { items.pop(); }],
  ['extra seventh', (items) => { items.push({ ...first(items), id: 999, name: 'backend-unit-coverage-7' }); }],
  ['duplicate name', (items) => { first(items).name = 'backend-unit-coverage-2'; }],
  ['malformed name', (items) => { first(items).name = 'backend-unit-coverage-01'; }],
  ['additional malformed artifact', (items) => { items.push({ ...first(items), id: 999, name: 'backend-unit-coverage-other' }); }],
  ['duplicate id', (items) => { first(items).id = items[1]!.id; }],
  ['invalid id', (items) => { first(items).id = 0; }],
  ['fractional id', (items) => { first(items).id = 1.5; }],
  ['empty archive', (items) => { first(items).size_in_bytes = 0; }],
  ['expired flag', (items) => { first(items).expired = true; }],
  ['past expiry despite false flag', (items) => { first(items).expires_at = '2000-01-01T00:00:00Z'; }],
  ['malformed expiry', (items) => { first(items).expires_at = 'tomorrow'; }],
  ['wrong run', (items) => { first(items).workflow_run.id++; }],
  ['wrong tested head', (items) => { first(items).workflow_run.head_sha = 'b'.repeat(40); }],
];
for (const [label, mutate] of badArtifacts) test(`coverage metadata fails closed: ${label}`, () => {
  fixture('coverage-metadata-', (directory) => {
    const items = artifacts(); mutate(items);
    assert.notEqual(metadataResult(directory, page(items)).status, 0);
  });
});
for (const [label, source] of [
  ['malformed JSON', '{'], ['empty pages', []], ['API error shape', { message: 'synthetic error' }],
  ['missing artifacts array', [{ total_count: 6 }]], ['missing count', [{ artifacts: artifacts() }]],
  ['truncated pagination', [{ total_count: 7, artifacts: artifacts() }]],
  ['malformed artifact', page([...artifacts(), { id: 999 }])],
  ['string run id', page(artifacts().map((item) => ({ ...item, workflow_run: { id: String(runId), head_sha: head } })))],
  ['missing provenance', page(artifacts().map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'workflow_run'))))],
  ['missing expiry flag', page(artifacts().map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'expired'))))],
] as const) test(`coverage metadata fails closed: ${label}`, () => {
  fixture('coverage-metadata-', (directory) => assert.notEqual(metadataResult(directory, source).status, 0));
});
test('coverage metadata cannot mask a failed API call with a valid response', () => {
  fixture('coverage-metadata-', (directory) => assert.notEqual(metadataResult(directory, page(artifacts()), 1).status, 0));
});

const makeShard = (directory: string, shard: number): string => {
  const folder = join(directory, 'coverage-data', `backend-unit-coverage-${shard}`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'lcov.info'), 'TN:synthetic\n');
  return folder;
};
for (let shard = 1; shard <= 6; shard++) test(`coverage shard ${shard} accepts only its own directory`, () => {
  fixture('coverage-shard-', (directory) => {
    makeShard(directory, shard);
    assert.equal(shell(ownShard, directory, { SHARD: String(shard) }).status, 0);
    assert.notEqual(shell(ownShard, directory, { SHARD: String(shard % 6 + 1) }).status, 0);
  });
});
const badDownloads: Array<[string, (directory: string, folder: string) => void]> = [
  ['missing artifact', (_directory, folder) => { rmSync(folder, { recursive: true }); }],
  ['extra artifact', (directory) => { makeShard(directory, 5); }],
  ['missing lcov', (_directory, folder) => { rmSync(join(folder, 'lcov.info')); }],
  ['empty lcov', (_directory, folder) => { writeFileSync(join(folder, 'lcov.info'), ''); }],
  ['extra file', (_directory, folder) => { writeFileSync(join(folder, 'unexpected'), 'synthetic'); }],
  ['hidden extra file', (_directory, folder) => { writeFileSync(join(folder, '.unexpected'), 'synthetic'); }],
  ['hidden extra directory', (directory) => { mkdirSync(join(directory, 'coverage-data', '.unexpected')); }],
  ['lcov is directory', (_directory, folder) => { rmSync(join(folder, 'lcov.info')); mkdirSync(join(folder, 'lcov.info')); }],
  ['lcov is symlink', (_directory, folder) => {
    rmSync(join(folder, 'lcov.info'));
    // Keep the target outside the artifact so count alone cannot reject this.
    const target = join(folder, '..', '..', 'target');
    writeFileSync(target, 'synthetic');
    symlinkSync(target, join(folder, 'lcov.info'));
  }],
  ['artifact directory is symlink', (directory, folder) => {
    rmSync(folder, { recursive: true });
    const target = join(directory, 'target'); mkdirSync(target); writeFileSync(join(target, 'lcov.info'), 'synthetic');
    symlinkSync(target, folder);
  }],
  ['download root is symlink', (directory) => {
    rmSync(join(directory, 'coverage-data'), { recursive: true });
    const target = join(directory, 'target'); makeShard(target, 6);
    symlinkSync(join(target, 'coverage-data'), join(directory, 'coverage-data'));
  }],
];
for (const [label, mutate] of badDownloads) test(`coverage shard fails closed: ${label}`, () => {
  fixture('coverage-shard-', (directory) => {
    const folder = makeShard(directory, 6); mutate(directory, folder);
    assert.notEqual(shell(ownShard, directory, { SHARD: '6' }).status, 0);
  });
});
