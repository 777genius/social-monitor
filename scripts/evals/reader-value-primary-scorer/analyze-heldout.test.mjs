import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const analyzer = join(process.cwd(), 'scripts/evals/reader-value-primary-scorer/analyze-heldout.mjs');
const days = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'];

test('orders the eighth slot with PostgreSQL microsecond precision', () => {
  const firstDayTimes = [
    '2026-09-13T12:00:07.000000Z', '2026-09-13T12:00:06.000000Z',
    '2026-09-13T12:00:05.000000Z', '2026-09-13T12:00:04.000000Z',
    '2026-09-13T12:00:03.000000Z', '2026-09-13T12:00:02.000000Z',
    '2026-09-13T12:00:01.000000Z', '2026-09-13T12:00:00.123456Z',
    '2026-09-13T12:00:00.123455Z',
  ];
  const result = runAnalysis({ firstDayTimes });
  const selected = result.selection.days[0].v3Ids;
  assert.equal(selected.length, 8);
  assert.ok(selected.includes(candidateId(8)));
  assert.ok(!selected.includes(candidateId(9)));
});

test('uses candidate id byte order when exact timestamps tie at the eighth slot', () => {
  const firstDayTimes = [
    ...Array.from({ length: 7 }, (_, index) =>
      `2026-09-13T12:00:0${7 - index}.000000Z`),
    '2026-09-13T12:00:00.123456Z', '2026-09-13T12:00:00.123456Z',
  ];
  const selected = runAnalysis({ firstDayTimes }).selection.days[0].v3Ids;
  assert.ok(selected.includes(candidateId(8)));
  assert.ok(!selected.includes(candidateId(9)));
});

test('reports missing usage as unknown while retaining known subtotals', () => {
  const result = runAnalysis({ omitUsageFor: candidateId(3) });
  assert.equal(result.safe.costUsd, null);
  assert.equal(result.safe.inputTokens, null);
  assert.deepEqual(result.safe.usageAccounting, {
    callCount: 13,
    knownCostCallCount: 12,
    unknownCostCallCount: 1,
    knownInputTokensCallCount: 12,
    unknownInputTokensCallCount: 1,
    unknownUsageCallCount: 1,
    hasUnknownUsage: true,
    knownCostUsdSubtotal: 1.5,
    knownInputTokensSubtotal: 120,
  });
});

test('reports invalid usage values as unknown rather than zero', () => {
  const safe = runAnalysis({ invalidUsageFor: candidateId(4) }).safe;
  assert.equal(safe.costUsd, null);
  assert.equal(safe.inputTokens, null);
  assert.equal(safe.usageAccounting.unknownUsageCallCount, 1);
  assert.equal(safe.usageAccounting.hasUnknownUsage, true);
  assert.equal(safe.usageAccounting.knownCostUsdSubtotal, 1.5);
  assert.equal(safe.usageAccounting.knownInputTokensSubtotal, 120);
});

test('rejects stale source and request digests with candidate-specific errors', () => {
  for (const field of ['sourceSnapshotSha256', 'requestSha256']) {
    assert.throws(() => runAnalysis({ transformRecords: (records) => records.map((record, index) =>
      index === 0 ? { ...record, [field]: 'stale' } : record) }),
    new RegExp(`heldout result provenance mismatch for candidate ${candidateId(1)}: ${field}`, 'u'));
  }
});

test('rejects stale scoring configuration and rubric provenance', () => {
  for (const field of ['rubricVersion', 'configSha256']) {
    assert.throws(() => runAnalysis({ transformRecords: (records) => records.map((record, index) =>
      index === 0 ? { ...record, [field]: 'stale' } : record) }),
    new RegExp(`heldout result provenance mismatch for candidate ${candidateId(1)}: ${field}`, 'u'));
  }
});

test('rejects duplicate successes independently of JSONL order', () => {
  const duplicate = (records) => [...records, { ...records[0] }];
  const errors = [duplicate, (records) => duplicate(records).reverse()].map((transformRecords) => {
    try {
      runAnalysis({ transformRecords });
      assert.fail('expected duplicate successes to be rejected');
    } catch (error) {
      return String(error);
    }
  });
  const expected = `duplicate successful heldout result for candidate ${candidateId(1)}`;
  assert.ok(errors.every((message) => message.includes(expected)));
});

function runAnalysis({ firstDayTimes, omitUsageFor, invalidUsageFor,
  transformRecords = (records) => records } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'reader-value-heldout-analysis-'));
  const timestamps = firstDayTimes ?? Array.from({ length: 9 }, (_, index) =>
    `2026-09-13T12:00:${String(9 - index).padStart(2, '0')}.000000Z`);
  const rows = [
    ...timestamps.map((publishedAt, index) => row(index + 1, days[0], publishedAt)),
    ...days.slice(1).map((day, index) => row(index + 10, day, `${day}T12:00:00.000000Z`)),
  ];
  const scoringConfig = { rubricVersion: 'reader-value.v1', configSha256: 'config' };
  const corpus = { corpusId: 'fixture', corpusDigest: 'corpus', scorerCorpusDigest: 'scorer',
    cutoffKind: 'fixture', cutoffs: [], days, rowCount: rows.length, rows,
    scoringConfig,
    interest: { query: 'fixture interest' },
    legacyTop: days.map((day) => ({ day, status: 'READY', selected: [] })) };
  const records = transformRecords(rows.map((candidate) => ({ candidateId: candidate.candidateId,
    sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    requestSha256: candidate.requestSha256,
    status: 'success', latencyMs: 10, ...scoringConfig,
    response: { model: 'fixture-model', provider: 'fixture-provider', answers: usefulAnswers(),
      ...(candidate.candidateId === omitUsageFor ? {} : { usage:
        candidate.candidateId === invalidUsageFor ? { cost: -1, input_tokens: '10' } :
          { cost: 0.125, input_tokens: 10 } }) } })));
  const paths = ['corpus.json', 'results.jsonl', 'packet.json', 'safe.json', 'selection.json']
    .map((name) => join(directory, name));
  writeFileSync(paths[0], JSON.stringify(corpus));
  writeFileSync(paths[1], `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  execFileSync(process.execPath, [analyzer, ...paths], { stdio: 'pipe' });
  return { safe: JSON.parse(readFileSync(paths[3], 'utf8')),
    selection: JSON.parse(readFileSync(paths[4], 'utf8')) };
}

function row(ordinal, day, publishedAt) {
  const title = `Title ${ordinal}`;
  const body = `Body ${ordinal}`;
  return { candidateId: candidateId(ordinal), day, providerKey: 'rss',
    sourceItemId: `source-${ordinal}`, canonicalUrl: `https://example.test/story-${ordinal}`,
    title, body, textState: 'full', modelInputTruncated: false, publishedAt,
    sourceSnapshotSha256: sha256(JSON.stringify({ title, body })),
    requestSha256: sha256(JSON.stringify({ interest: 'fixture interest', title, body,
      rubricVersion: 'reader-value.v1', configSha256: 'config' })) };
}

function candidateId(ordinal) {
  return `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
}

function usefulAnswers() {
  return { usefulness: { choice: 'useful' }, relevance: { choice: 'relevant' } };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
