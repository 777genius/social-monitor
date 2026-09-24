import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const evaluator = join(process.cwd(), 'scripts/evals/reader-value-primary-scorer/evaluate-heldout-labels.mjs');

test('does not declare superiority when the selected baseline is absent and noise is n/a', () => {
  const output = run({ legacySelected: false, controls: ['v3-story-1'], technical: true });
  assert.equal(output.totals.legacy_v2.noiseFraction, null);
  assert.equal(output.verdict, 'quality_not_proven');
});

test('does not declare superiority without explicit technical fixture evidence', () => {
  const output = run({ legacySelected: true, controls: ['v3-story-1'], technical: false });
  assert.equal(output.controls.technicalFixtures.passed, false);
  assert.equal(output.verdict, 'quality_not_proven');
});

test('does not declare superiority when an explicitly known-important story is lost', () => {
  const output = run({ legacySelected: true, controls: ['missing-control-story'], technical: true });
  assert.deepEqual(output.controls.knownImportant.missingStoryKeys, ['missing-control-story']);
  assert.equal(output.verdict, 'quality_not_proven');
});

test('requires all comparison, control, and technical evidence before passing', () => {
  const output = run({ legacySelected: true, controls: ['v3-story-1'], technical: true });
  assert.equal(output.controls.knownImportant.preserved, true);
  assert.equal(output.controls.technicalFixtures.passed, true);
  assert.equal(output.verdict, 'reviewer_only_quality_pass');
});

test('rejects more than eight selections for either variant on a day', () => {
  assert.throws(() => run({ legacySelected: true, controls: ['v3-story-1'], technical: true,
    mutateSelection(selection) {
      selection.days[0].v3Ids = Array.from({ length: 9 }, (_, index) => `extra-${index}`);
    }, extraItems: Array.from({ length: 9 }, (_, index) => ({ candidateId: `extra-${index}`,
      editorialValue: 'useful', importance: 'important', storyKey: `extra-story-${index}` })) }),
  /jev_reviewer_v3 has 9 selections.*maximum is 8/u);
});

test('rejects a duplicate selected candidate identity', () => {
  assert.throws(() => run({ legacySelected: true, controls: ['v3-story-1'], technical: true,
    mutateSelection(selection) {
      selection.days[0].v3Ids.push(selection.days[0].v3Ids[0]);
    } }), /duplicate candidate identity/u);
});

test('rejects nonconsecutive and duplicate day windows', () => {
  assert.throws(() => run({ legacySelected: true, controls: ['v3-story-1'], technical: true,
    mutateSelection(selection) {
      selection.days[2].day = selection.days[1].day;
      for (const row of selection.labeledRows) {
        if (row.day === '2026-09-15') row.day = selection.days[2].day;
      }
    } }), /day windows are not distinct and consecutive.*duplicate day/u);
});

test('cannot certify a scorer report without complete usage accounting', () => {
  const output = run({ legacySelected: true, controls: ['v3-story-1'], technical: true,
    scorerUsage: null });
  assert.deepEqual(output.controls.usageAccounting, { complete: false, hasUnknownUsage: true,
    unknownUsageCallCount: null, diagnostics: ['scorer usage accounting is missing'] });
  assert.equal(output.verdict, 'quality_not_proven');
});

function run({ legacySelected, controls, technical, mutateSelection, extraItems = [],
  scorerUsage = completeUsageAccounting() }) {
  const directory = mkdtempSync(join(tmpdir(), 'reader-value-heldout-eval-'));
  const days = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'];
  const selectionDays = days.map((day, index) => ({ day,
    legacyIds: legacySelected ? [`legacy-${index}`] : [], v3Ids: [`v3-${index}`] }));
  const items = selectionDays.flatMap((day, index) => [
    ...(legacySelected ? [{ candidateId: day.legacyIds[0], editorialValue: 'noise',
      importance: 'not_important', storyKey: `legacy-story-${index}`, day: day.day }] : []),
    { candidateId: day.v3Ids[0], editorialValue: 'useful', importance: 'important',
      storyKey: `v3-story-${index}`, day: day.day },
  ]).concat(extraItems.map((item) => ({ ...item, day: item.day ?? days[0] })));
  const selection = { corpusDigest: 'corpus', days: selectionDays,
    labeledRows: items.map((item) => ({ candidateId: item.candidateId, day: item.day })),
    knownImportantControlStoryKeys: controls,
    requiredTechnicalFixtureIds: ['reader-value-full-path'],
  };
  mutateSelection?.(selection);
  const scorer = { corpusDigest: 'corpus', scorerCorpusDigest: 'scorer',
    blindPacket: { rowCount: items.length, packetSha256: 'packet' }, limitations: [],
    scoredCount: items.length, days: days.map((day) => ({ day })), costUsd: 0.01,
    inputTokens: 10 };
  if (scorerUsage !== null) scorer.usageAccounting = { ...scorerUsage, callCount: items.length,
    knownCostCallCount: items.length, knownInputTokensCallCount: items.length };
  const labelsA = { judge: { kind: 'fixture-a' }, items };
  const labelsB = { judge: { kind: 'fixture-b' }, items: [] };
  const paths = ['selection.json', 'scorer.json', 'labels-a.json', 'labels-b.json', 'output.json']
    .map((name) => join(directory, name));
  [selection, scorer, labelsA, labelsB].forEach((value, index) =>
    writeFileSync(paths[index], JSON.stringify(value)));
  const args = [evaluator, ...paths.slice(0, 4), paths[4]];
  if (technical) {
    const fixturePath = join(directory, 'technical-fixtures.json');
    writeFileSync(fixturePath, JSON.stringify({
      schemaVersion: 'reader-value-primary-scorer-technical-fixtures.v1',
      fixtures: [{ id: 'reader-value-full-path', passed: true }],
    }));
    args.push(fixturePath);
  }
  execFileSync(process.execPath, args, { stdio: 'pipe' });
  return JSON.parse(readFileSync(paths[4], 'utf8'));
}

function completeUsageAccounting() {
  return { callCount: 0, knownCostCallCount: 0, unknownCostCallCount: 0,
    knownInputTokensCallCount: 0, unknownInputTokensCallCount: 0, unknownUsageCallCount: 0,
    hasUnknownUsage: false, knownCostUsdSubtotal: 0.01, knownInputTokensSubtotal: 10 };
}
