import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateRunnerImplementationMarkers } from '../lib/external-beta-evidence-runner-markers.mjs';

const runnerFile = 'scripts/external-beta-evidence-runner.mjs';
const checkFile = 'scripts/check-external-beta-evidence-runner.mjs';
const selectionHelperPath = 'scripts/lib/external-beta-evidence-selections.mjs';
const sources = {
  runnerSource: readFileSync(runnerFile, 'utf8'),
  checkSource: readFileSync(checkFile, 'utf8'),
  selectionHelperSource: readFileSync(selectionHelperPath, 'utf8'),
  runnerFile,
  checkFile,
  selectionHelperPath,
};

test('every runner and checker implementation marker exists at its owning source', () => {
  assert.deepEqual(validateRunnerImplementationMarkers(sources), []);
});

test('a missing selection diagnostic fails closed at the extracted helper', () => {
  const violations = validateRunnerImplementationMarkers({
    ...sources,
    selectionHelperSource: sources.selectionHelperSource.replace(
      '--jobs requires at least one job id', 'missing-marker',
    ),
  });
  assert.deepEqual(violations, [
    `${selectionHelperPath}: selection helper must reject an empty --jobs list`,
  ]);
});

test('legacy runner and checker markers are still enforced', () => {
  const missingRunner = validateRunnerImplementationMarkers({
    ...sources,
    runnerSource: sources.runnerSource.replaceAll('unknownJobIds', 'missing-marker'),
  });
  assert.ok(missingRunner.some((message) => message.startsWith(`${runnerFile}:`)));
  const missingCheck = validateRunnerImplementationMarkers({
    ...sources,
    checkSource: sources.checkSource.replaceAll('strictSemanticNegativeSmokeLabels', 'missing-marker'),
  });
  assert.ok(missingCheck.some((message) => message.startsWith(`${checkFile}:`)));
});
