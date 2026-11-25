import assert from 'node:assert/strict';
import test from 'node:test';

import {
  danglingObjectSignals,
  danglingSignalPriority,
  prioritizeDanglingRows,
} from '../lib/docker-evidence-dangling-signals.mjs';

test('recognizes existing Docker signals case-insensitively and in the original order', () => {
  assert.deepEqual(
    danglingObjectSignals('SOCIAL-MONITOR staging-evidence com.docker.compose.project npm ci PRISMA GENERATE'),
    [
      'social-monitor marker',
      'backend evidence marker',
      'compose project label',
      'node build layer marker',
      'backend build layer marker',
    ],
  );
});

test('recognizes each evidence or build marker alias', () => {
  assert.deepEqual(danglingObjectSignals('backend-evidence'), ['backend evidence marker']);
  assert.deepEqual(danglingObjectSignals('package-lock.json'), ['node build layer marker']);
  assert.deepEqual(danglingObjectSignals('tsc -p tsconfig.build.json'), ['backend build layer marker']);
});

test('returns original fallback when no project marker is found', () => {
  assert.deepEqual(danglingObjectSignals(''), ['no obvious project marker']);
  assert.deepEqual(danglingObjectSignals('unrelated docker image'), ['no obvious project marker']);
});

test('applies the original signal priority ladder', () => {
  assert.equal(danglingSignalPriority(['social-monitor marker']), 50);
  assert.equal(danglingSignalPriority(['backend evidence marker']), 40);
  assert.equal(danglingSignalPriority(['backend build layer marker']), 30);
  assert.equal(danglingSignalPriority(['node build layer marker']), 20);
  assert.equal(danglingSignalPriority(['compose project label']), 10);
  assert.equal(danglingSignalPriority(['no obvious project marker']), 0);
});

test('chooses the highest priority marker regardless of signal order', () => {
  assert.equal(danglingSignalPriority(['compose project label', 'social-monitor marker']), 50);
  assert.equal(danglingSignalPriority(['backend build layer marker', 'backend evidence marker']), 40);
});

test('sorts rows by signal priority while preserving tie order', () => {
  const rows = ['other', 'compose', 'backend', 'project-1', 'node', 'build', 'project-2'];
  const texts = {
    other: 'unrelated', compose: 'com.docker.compose.project', backend: 'staging-evidence',
    'project-1': 'social-monitor', node: 'npm ci', build: 'prisma generate',
    'project-2': 'SOCIAL-MONITOR',
  };
  const calls = [];
  const sorted = prioritizeDanglingRows({
    rows,
    inspect: (row) => {
      calls.push(row);
      return { signals: danglingObjectSignals(texts[row]) };
    },
  });
  assert.deepEqual(sorted, ['project-1', 'project-2', 'backend', 'build', 'node', 'compose', 'other']);
  assert.deepEqual(rows, ['other', 'compose', 'backend', 'project-1', 'node', 'build', 'project-2']);
  assert.deepEqual(calls, rows);
});

test('returns undefined without inspecting when Docker listing is unavailable', () => {
  assert.equal(prioritizeDanglingRows({
    rows: undefined,
    inspect: () => { throw new Error('must not inspect unavailable rows'); },
  }), undefined);
});

test('keeps empty listings empty without calling inspection', () => {
  assert.deepEqual(prioritizeDanglingRows({
    rows: [],
    inspect: () => { throw new Error('must not inspect empty rows'); },
  }), []);
});
