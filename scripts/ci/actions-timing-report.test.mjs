import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareRuns, fetchRun, summarizeRun } from './actions-timing-report.mjs';
const head = 'a'.repeat(40);
const at = (minute) => `2026-10-02T00:${String(minute).padStart(2, '0')}:00Z`;
const run = { id: 42, head_sha: head, run_attempt: 2, status: 'completed', conclusion: 'success',
  created_at: at(0), run_started_at: at(1), updated_at: at(10) };
const job = (id, start, end) => ({ id, name: `job ${id}`, created_at: at(0), started_at: at(start),
  completed_at: at(end), status: 'completed', conclusion: 'success' });

test('overlapping jobs sum runner minutes independently of run wall clock', () => {
  const result = summarizeRun(run, [job(1, 1, 6), job(2, 2, 9)], head);
  assert.equal(result.wallSeconds, 600);
  assert.equal(result.executionWindowSeconds, 540);
  assert.equal(result.activeRunnerMinutes, 12);
  assert.equal(result.longestJob.id, 2);
  assert.deepEqual(result.jobs.map((row) => [row.queueSeconds, row.durationSeconds]), [[60, 300], [120, 420]]);
  const baseline = summarizeRun({ ...run, id: 43, updated_at: at(8) }, [job(3, 0, 6)], head);
  assert.deepEqual(compareRuns(result, baseline).delta, { wallSeconds: 120, activeRunnerMinutes: 6 });
});

test('missing/nullable/cancelled timings are explicit and no runner-quota inference', () => {
  const result = summarizeRun({ ...run, conclusion: 'cancelled' }, [
    { ...job(1, 1, 6), created_at: undefined },
    { ...job(2, 1, 6), conclusion: 'cancelled', completed_at: null },
    { id: 3, name: 'skipped', status: 'completed', conclusion: 'skipped', started_at: null, completed_at: null },
  ], head);
  assert.equal(result.jobs[0].queueSeconds, null);
  assert.equal(result.jobs[0].waitSinceRunCreatedSeconds, 60);
  assert.equal(result.activeRunnerMinutes, null);
  assert.equal(result.sumKnownRunnerMinutes, 5);
  assert.equal(result.jobs[1].durationSeconds, null);
  assert.equal(result.jobs[2].durationSeconds, 0);
  assert.equal(result.runnerTimingComplete, false);
  assert.equal(compareRuns(result, result).delta.activeRunnerMinutes, null);
  const queued = summarizeRun({ ...run, status: 'queued', conclusion: null, run_started_at: null }, [], head);
  assert.equal(queued.wallSeconds, null);
  assert.equal(queued.longestJob, null);
  assert.equal(queued.activeRunnerMinutes, null);
});

test('malformed, reversed and missing timestamps never manufacture elapsed time', () => {
  const result = summarizeRun({ ...run, updated_at: 'bad' }, [job(1, 9, 2), { ...job(2, 1, 2), started_at: 'not a date' }], head);
  assert.equal(result.wallSeconds, null);
  assert.equal(result.activeRunnerMinutes, null);
  assert.equal(result.jobs[0].durationSeconds, null);
  assert.ok(result.issues.length > 0);
  assert.ok(result.jobs[0].issues.includes('reversed job duration'));
  const calendar = summarizeRun(run, [{ ...job(1, 1, 2), started_at: '2026-02-30T00:00:00Z' }], head);
  assert.equal(calendar.jobs[0].durationSeconds, null);
  assert.throws(() => summarizeRun(run, [job(1, 1, 2), job(1, 2, 3)], head), /duplicate/u);
  assert.throws(() => summarizeRun(run, [], 'b'.repeat(40)), /head/u);
});

test('fetch adapter uses actual attempt endpoint, pages all jobs and verifies run binding', () => {
  const calls = [];
  const jobs = Array.from({ length: 101 }, (_, index) => job(index + 1, 1, 2));
  const request = (endpoint) => {
    calls.push(endpoint);
    if (!endpoint.includes('/jobs?')) return run;
    return { total_count: jobs.length, jobs: endpoint.endsWith('page=1') ? jobs.slice(0, 100) : jobs.slice(100) };
  };
  const result = fetchRun({ repo: 'test/repo', runId: 42, expectedSha: head }, request);
  assert.equal(result.jobs.length, 101);
  assert.equal(result.activeRunnerMinutes, 101);
  assert.deepEqual(calls, ['repos/test/repo/actions/runs/42',
    'repos/test/repo/actions/runs/42/attempts/2/jobs?per_page=100&page=1',
    'repos/test/repo/actions/runs/42/attempts/2/jobs?per_page=100&page=2', 'repos/test/repo/actions/runs/42']);
});

test('pagination errors, run mutation and wrong source selectors fail closed', () => {
  const selector = { repo: 'test/repo', runId: 42, expectedSha: head };
  assert.throws(() => fetchRun(selector, () => ({ ...run, head_sha: 'b'.repeat(40) })), /mismatch/u);
  for (const response of [{ total_count: 1, jobs: [] }, { total_count: -1, jobs: [] },
    { total_count: 0, jobs: [job(1, 1, 2)] }, { jobs: null }]) {
    assert.throws(() => fetchRun(selector, (endpoint) => endpoint.includes('/jobs?') ? response : run), /pagination/u);
  }
  let page = 0;
  assert.throws(() => fetchRun(selector, (endpoint) => endpoint.includes('/jobs?')
    ? { total_count: ++page === 1 ? 101 : 100, jobs: [job(page, 1, 2)] } : run), /changing/u);
  let observations = 0;
  assert.throws(() => fetchRun(selector, (endpoint) => endpoint.includes('/jobs?')
    ? { total_count: 0, jobs: [] } : { ...run, run_attempt: ++observations === 1 ? 2 : 3 }), /changed/u);
  assert.throws(() => fetchRun({ ...selector, repo: '../test' }, () => run), /selector/u);
});
