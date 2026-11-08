import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hasStagingRealEvidenceIdentityDelegation } from '../lib/evidence-identity-delegation-guard.mjs';

const checker = readFileSync('scripts/check-staging-reliability-evidence.mjs', 'utf8');
const policy = readFileSync('scripts/lib/staging-reliability-artifact-guards.mjs', 'utf8');
const delegated = (a = checker, b = policy) => hasStagingRealEvidenceIdentityDelegation(a, b);

test('actual staging checker delegates identity policy to the imported guard', () => {
  assert.equal(delegated(), true);
});

test('missing checker guard import cannot pass provenance code-quality gate', () => {
  assert.equal(delegated(checker.replace(
    'from "./lib/staging-reliability-artifact-guards.mjs"', 'from "./lib/removed-guard.mjs"',
  )), false);
});

test('missing constructor invocation cannot pass the quality gate', () => {
  assert.equal(delegated(checker.replace(
    'createStagingReliabilityArtifactGuards(violations)', 'removedGuard(violations)',
  )), false);
});

test('checker must retain the bound real artifact identity validator', () => {
  assert.equal(delegated(checker.replace('  validateRealArtifactIdentity,\n', '  removedIdentity,\n')), false);
});

test('helper must directly import the canonical real-evidence provenance policy', () => {
  assert.equal(delegated(checker, policy.replace(
    'from "./evidence-provenance.mjs"', 'from "./removed-provenance.mjs"',
  )), false);
});

test('helper must actually invoke canonical identity guard, not merely mention its name', () => {
  assert.equal(delegated(checker, policy.replace(
    'validateRealEvidenceIdentityStrings({', 'removedIdentityValidation({',
  )), false);
});

test('helper must retain both bound function and returned export', () => {
  assert.equal(delegated(checker, policy.replace(
    'function validateRealArtifactIdentity(', 'function removedIdentityGuard(',
  )), false);
  assert.equal(delegated(checker, policy.replace(
    '    validateRealArtifactIdentity,\n', '    removedIdentity,\n',
  )), false);
});

test('unrelated provenance checker cannot reuse the staging-only exception', () => {
  assert.equal(hasStagingRealEvidenceIdentityDelegation(
    'validateEvidenceArtifactProvenance();', policy,
  ), false);
});
