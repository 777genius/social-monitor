import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createDockerStagingArtifactPolicy } from './docker-staging-artifact-policy.mjs';

function fixture() {
  const violations = [];
  return { violations, ...createDockerStagingArtifactPolicy({
    violations,
    captureScriptPath: 'scripts/capture-docker-backend-staging-evidence-bundle.mjs',
    forbiddenBundleFragments: ['forbidden-synthetic-fragment'],
    isRecord: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  }) };
}

test('valid provenance, redaction and bundle content pass', () => {
  const f = fixture();
  f.validateProvenance({ evidenceKind: 'docker_staging_bundle', runner: 'scripts/capture-docker-backend-staging-evidence-bundle.mjs', fixtureOnly: false }, 'bundle');
  f.validateBundleRedaction({ secretsIncluded: false, rawProviderPayloadsIncluded: false, databaseUrlsIncluded: false, brokerUrlsIncluded: false }, 'bundle');
  f.validateForbiddenBundleFragments({ note: 'safe' }, 'bundle');
  assert.deepEqual(f.violations, []);
});

test('provenance fails closed for missing or mismatched metadata', () => {
  const f = fixture();
  f.validateProvenance(null, 'bundle');
  f.validateProvenance({ evidenceKind: 'other', runner: 'other', fixtureOnly: true }, 'bundle');
  assert.deepEqual(f.violations, [
    'bundle: provenance must be an object',
    'bundle: provenance.evidenceKind must be docker_staging_bundle',
    'bundle: provenance.runner must be scripts/capture-docker-backend-staging-evidence-bundle.mjs',
    'bundle: provenance.fixtureOnly must be false',
  ]);
});

test('each redaction flag must be explicitly false', () => {
  const f = fixture();
  f.validateBundleRedaction([], 'bundle');
  f.validateBundleRedaction({ secretsIncluded: true, rawProviderPayloadsIncluded: null, databaseUrlsIncluded: undefined, brokerUrlsIncluded: 0 }, 'bundle');
  assert.equal(f.violations.length, 5);
});

test('forbidden serialized bundle fragments remain rejected', () => {
  const f = fixture();
  f.validateForbiddenBundleFragments({ nested: 'forbidden-synthetic-fragment' }, 'bundle');
  assert.deepEqual(f.violations, ['bundle: bundle summary must not include sensitive fragment forbidden-synthetic-fragment']);
});

test('mismatched summary counts and insufficient evidence are both rejected', () => {
  const f = fixture();
  f.validateCounts({ artifactId: 'test', signalCount: 0, operationCount: 0, surfaceCount: 0, sourceExportCount: 0, smokeCount: 0 },
    { signalResults: [{}] }, { minSignalCount: 2 }, 'bundle');
  assert.deepEqual(f.violations, [
    'bundle: test.signalCount must match artifact file',
    'bundle: test.signalCount must be at least 2',
  ]);
});

test('artifact redaction never allows truthy Included fields', () => {
  const f = fixture();
  f.validateArtifactRedaction({ redaction: null }, 'artifact');
  f.validateArtifactRedaction({ redaction: { tokensIncluded: true, rawIncluded: 1, note: 'allowed' } }, 'artifact');
  assert.deepEqual(f.violations, ['artifact: redaction.tokensIncluded must be false', 'artifact: redaction.rawIncluded must be false']);
});

test('durable runtime service and rollup fail-closed requirements survive the move', () => {
  const f = fixture();
  f.validateDurableRuntimeArtifact({ services: [{ serviceId: 'api-gateway' }], rollup: { allServicesDurable: false, forbiddenSelectorsFound: true } }, 'bundle');
  assert.equal(f.violations.length, 6);
  assert.ok(f.violations.some(x => x.includes('missing service ingestion-worker')));
  assert.ok(f.violations.some(x => x.includes('rollup.forbiddenSelectorsFound')));
});

test('the original checker retains the sole direct delegation', () => {
  const checker = readFileSync(new URL('../check-docker-backend-staging-evidence-bundle.mjs', import.meta.url), 'utf8');
  assert.match(checker, /createDockerStagingArtifactPolicy\(\{ violations, captureScriptPath, forbiddenBundleFragments, isRecord \}\)/);
  for (const name of ['validateProvenance', 'validateBundleRedaction', 'validateForbiddenBundleFragments', 'validateCounts', 'validateArtifactRedaction', 'validateDurableRuntimeArtifact']) {
    assert.doesNotMatch(checker, new RegExp('^function ' + name + '\\(', 'm'));
  }
});

test('npm bundle gate runs policy tests before the original checker and self-check matches', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const expected = 'node --test scripts/lib/docker-staging-artifact-policy.test.mjs && node scripts/check-docker-backend-staging-evidence-bundle.mjs';
  assert.equal(packageJson.scripts['check:docker-backend-staging-evidence-bundle'], expected);
  const checker = readFileSync(new URL('../check-docker-backend-staging-evidence-bundle.mjs', import.meta.url), 'utf8');
  assert.ok(checker.includes(`packageScripts[checkScriptName] !== '${expected}'`),
    'the original fail-closed npm wiring check must require the exact combined command');
});
