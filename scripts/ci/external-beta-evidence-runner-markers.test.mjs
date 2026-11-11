import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateRunnerImplementationMarkers, redactionPolicyPath, handoffPolicyPath, displayPolicyPath } from '../lib/external-beta-evidence-runner-markers.mjs';

const runnerFile = 'scripts/external-beta-evidence-runner.mjs';
const checkFile = 'scripts/check-external-beta-evidence-runner.mjs';
const selectionHelperPath = 'scripts/lib/external-beta-evidence-selections.mjs';
const sources = {
  runnerSource: readFileSync(runnerFile, 'utf8'),
  handoffSource: readFileSync(handoffPolicyPath, 'utf8'),
  displaySource: readFileSync(displayPolicyPath, 'utf8'),
  checkSource: readFileSync(checkFile, 'utf8'),
  selectionHelperSource: readFileSync(selectionHelperPath, 'utf8'),
  redactionPolicySource: readFileSync(redactionPolicyPath, 'utf8'),
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

test('extracted redaction policy markers are independently fail-closed', () => {
  const violations = validateRunnerImplementationMarkers({
    ...sources,
    redactionPolicySource: sources.redactionPolicySource.replaceAll(
      'forbiddenArtifactValueFragments', 'removed-redaction-marker',
    ),
  });
  assert.deepEqual(violations, [
    `${redactionPolicyPath}: extracted redaction policy must preserve "forbiddenArtifactValueFragments"`,
  ]);
});

test('relocated JSON handoff markers stay enforced at the actual module owner', () => {
  for (const marker of [
    'buildHandoff', 'buildHandoffArtifactContracts', 'buildHandoffInputs',
    'buildHandoffEnvArtifacts', 'requiredAlternativeInputs',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      handoffSource: sources.handoffSource.replaceAll(marker, 'removed-handoff-marker'),
    });
    assert.ok(violations.includes(
      `${handoffPolicyPath}: extracted JSON handoff must preserve "${marker}"`,
    ), `missing handoff module marker must reject: ${marker}`);
    assert.ok(violations.every((violation) => violation.startsWith(handoffPolicyPath)),
      'runner and unrelated policy ownership must stay untouched');
  }
});

test('relocated display markers are still enforced at their real owner', () => {
  for (const marker of [
    'formatOutputArtifacts', 'formatRequiredEnvAlternatives', 'formatHandoffArtifacts',
    'handoffAction', 'handoffRunner', 'artifactExamplePathByFormat', 'inputMetadataByEnv',
    'runnerDescription', 'operatorAction',
  ]) {
    const violations = validateRunnerImplementationMarkers({
      ...sources,
      displaySource: sources.displaySource.replaceAll(marker, 'removed-display-marker'),
    });
    assert.ok(violations.includes(
      `${displayPolicyPath}: extracted display formatters must preserve "${marker}"`,
    ), `missing display module marker must reject: ${marker}`);
    assert.ok(violations.every(v => v.startsWith(displayPolicyPath)),
      'unrelated source ownership must not be weakened');
  }
});

test('original checker reads display markers into its fail-closed source gate', () => {
  const checkerSource = readFileSync(checkFile, 'utf8');
  assert.match(checkerSource, /displaySource:\\s*readFileSync\\(displayPolicyPath,\\s*'utf8'\\)/);
});

test('original checker reads the extracted handoff module into its fail-closed marker gate', () => {
  const checkerSource = readFileSync(checkFile, 'utf8');
  assert.match(checkerSource, /handoffSource:\s*readFileSync\(handoffPolicyPath,\s*'utf8'\)/);
  assert.match(checkerSource, /validateRunnerImplementationMarkers\(/);
});
