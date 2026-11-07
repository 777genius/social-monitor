import assert from 'node:assert/strict';
import test from 'node:test';
import { readEnvFileSelection, readSelectedJobSelection } from './external-beta-evidence-selections.mjs';

test('job selection preserves repeated order, duplicates, trimming and ignored flags', () => {
  assert.deepEqual(readSelectedJobSelection([
    '--summary', '--job', ' one ', '--jobs', 'two, ,three,two', '--job', 'one', '--json',
  ]), { jobIds: ['one', 'two', 'three', 'two', 'one'], errors: [] });
});

test('job selection keeps all original errors and continues scanning after bad values', () => {
  assert.deepEqual(readSelectedJobSelection([
    '--job', '--jobs', ',  ,', '--jobs', ' ', '--job', '--execute', '--job', 'ok', '--jobs',
  ]), {
    jobIds: ['ok'],
    errors: [
      '--job requires a non-empty job id value',
      '--jobs requires at least one job id',
      '--jobs requires a non-empty comma-separated job id list',
      '--job requires a non-empty job id value',
      '--jobs requires a non-empty comma-separated job id list',
    ],
  });
});

test('env-file selection preserves path strings, repetitions and ignored flags', () => {
  assert.deepEqual(readEnvFileSelection([
    '--env-file', ' /tmp/a.env ', '--job', 'x', '--env-file', '/tmp/a.env', '--env-file', 'relative.env',
  ]), { paths: ['/tmp/a.env', '/tmp/a.env', 'relative.env'], errors: [] });
});

test('env-file selection does not swallow following flag after absent or blank values', () => {
  assert.deepEqual(readEnvFileSelection([
    '--env-file', '--summary', '--env-file', ' ', '--env-file', '/tmp/yes.env', '--env-file',
  ]), {
    paths: ['/tmp/yes.env'],
    errors: [
      '--env-file requires a non-empty absolute env file path',
      '--env-file requires a non-empty absolute env file path',
      '--env-file requires a non-empty absolute env file path',
    ],
  });
});

test('empty CLI selections remain accepted and do not add defaults', () => {
  assert.deepEqual(readSelectedJobSelection([]), { jobIds: [], errors: [] });
  assert.deepEqual(readEnvFileSelection([]), { paths: [], errors: [] });
});
