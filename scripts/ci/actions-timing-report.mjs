#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fail = (message) => { throw new Error(message); };
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
function timestamp(value, field, issues) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    issues.push(`invalid ${field}`);
    return null;
  }
  const parsed = Date.parse(value);
  if (new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    issues.push(`invalid ${field}`);
    return null;
  }
  return parsed;
}
function interval(start, end, field, issues) {
  if (start === null || end === null) return null;
  if (end < start) { issues.push(`reversed ${field}`); return null; }
  return (end - start) / 1000;
}

export function summarizeRun(run, jobs, expectedSha) {
  if (!run || !sha(expectedSha) || run.head_sha !== expectedSha ||
      !Number.isSafeInteger(run.id) || run.id < 1 || !Array.isArray(jobs)) fail('invalid run or exact head SHA mismatch');
  const issues = [];
  const created = timestamp(run.created_at, 'run.created_at', issues);
  const updated = timestamp(run.updated_at, 'run.updated_at', issues);
  const started = timestamp(run.run_started_at, 'run.run_started_at', issues);
  const complete = run.status === 'completed';
  const wallSeconds = complete ? interval(created, updated, 'run wall interval', issues) : null;
  if (complete && wallSeconds === null) issues.push('completed run has no usable wall interval');
  const ids = new Set();
  const rows = jobs.map((job) => {
    if (!job || !Number.isSafeInteger(job.id) || job.id < 1 || ids.has(job.id) || typeof job.name !== 'string') fail('invalid or duplicate job');
    ids.add(job.id);
    const jobIssues = [];
    const jobCreated = timestamp(job.created_at, 'job.created_at', jobIssues);
    const jobStart = timestamp(job.started_at, 'job.started_at', jobIssues);
    const jobEnd = timestamp(job.completed_at, 'job.completed_at', jobIssues);
    const durationSeconds = job.status === 'completed'
      ? (job.conclusion === 'skipped' && jobStart === null && jobEnd === null ? 0
        : interval(jobStart, jobEnd, 'job duration', jobIssues)) : null;
    if (durationSeconds === null) jobIssues.push('job duration unavailable');
    // Older GitHub job responses omit created_at. Never call DAG/dependency wait runner queue time.
    const queueSeconds = interval(jobCreated, jobStart, 'job queue', jobIssues);
    const waitSinceRunCreatedSeconds = interval(created, jobStart, 'job wait since run creation', jobIssues);
    return { id: job.id, name: job.name, status: job.status ?? null, conclusion: job.conclusion ?? null,
      queueSeconds, waitSinceRunCreatedSeconds, durationSeconds, issues: jobIssues };
  });
  const timed = rows.filter((job) => job.durationSeconds !== null);
  const sumKnownRunnerMinutes = timed.reduce((sum, job) => sum + job.durationSeconds, 0) / 60;
  const runnerTimingComplete = rows.length > 0 && timed.length === rows.length;
  const longestJob = [...timed].sort((a, b) => b.durationSeconds - a.durationSeconds || a.id - b.id)[0] ?? null;
  return { runId: run.id, headSha: run.head_sha, attempt: run.run_attempt ?? 1, status: run.status ?? null,
    conclusion: run.conclusion ?? null, wallSeconds,
    executionWindowSeconds: complete ? interval(started, updated, 'run execution window', issues) : null,
    activeRunnerMinutes: runnerTimingComplete ? sumKnownRunnerMinutes : null,
    sumKnownRunnerMinutes, runnerTimingComplete, longestJob, jobs: rows, issues };
}

export function compareRuns(current, baseline) {
  const delta = (a, b) => a === null || b === null ? null : a - b;
  return { current, baseline, delta: { wallSeconds: delta(current.wallSeconds, baseline.wallSeconds),
    activeRunnerMinutes: delta(current.activeRunnerMinutes, baseline.activeRunnerMinutes) } };
}

const ghJson = (endpoint) => JSON.parse(execFileSync('gh', ['api', '--method', 'GET', endpoint], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
}));

export function fetchRun({ repo, runId, expectedSha }, request = ghJson) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo) ||
      repo.split('/').some((part) => part === '.' || part === '..') ||
      !Number.isSafeInteger(runId) || runId < 1 || !sha(expectedSha)) fail('invalid GitHub run selector');
  const prefix = `repos/${repo}/actions/runs/${runId}`;
  const run = request(prefix);
  if (run.id !== runId || run.head_sha !== expectedSha || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) fail('fetched run selector mismatch');
  const jobs = [];
  let total;
  for (let page = 1; page <= 1000; page++) {
    const response = request(`${prefix}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`);
    if (!response || !Array.isArray(response.jobs) || response.jobs.length > 100 ||
        !Number.isSafeInteger(response.total_count) || response.total_count < 0 ||
        (total !== undefined && total !== response.total_count)) fail('invalid or changing jobs pagination');
    total = response.total_count;
    jobs.push(...response.jobs);
    if (jobs.length > total) fail('jobs pagination exceeds total');
    if (jobs.length === total) {
      // A completed run must stay on the same attempt/head while paging.
      const final = request(prefix);
      if (final.id !== runId || final.head_sha !== expectedSha || final.run_attempt !== run.run_attempt ||
          final.status !== run.status || final.updated_at !== run.updated_at) fail('run changed during timing fetch; retry');
      return summarizeRun(final, jobs, expectedSha);
    }
    if (!response.jobs.length) fail('incomplete jobs pagination');
  }
  fail('jobs pagination limit exceeded');
}

export function main(args) {
  const allowed = new Set(['--repo', '--run', '--head', '--baseline-run', '--baseline-head']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || options[args[index]] !== undefined || !args[index + 1]) fail('invalid timing arguments');
    options[args[index]] = args[index + 1];
  }
  if (!options['--repo'] || !options['--run'] || !options['--head'] ||
      Boolean(options['--baseline-run']) !== Boolean(options['--baseline-head'])) fail('usage: --repo OWNER/REPO --run ID --head SHA [--baseline-run ID --baseline-head SHA]');
  const current = fetchRun({ repo: options['--repo'], runId: Number(options['--run']), expectedSha: options['--head'] });
  const result = options['--baseline-run'] ? compareRuns(current, fetchRun({ repo: options['--repo'],
    runId: Number(options['--baseline-run']), expectedSha: options['--baseline-head'] })) : current;
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
