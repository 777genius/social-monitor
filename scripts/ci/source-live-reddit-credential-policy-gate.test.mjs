import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import '../lib/source-live-reddit-credential-policy.test.mjs';

const checker = readFileSync(new URL('../check-source-live-certification-evidence.mjs', import.meta.url), 'utf8');
const moduleName = './lib/source-live-reddit-credential-policy.mjs';
function assertWired(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.ok(clean.includes("import { createSourceLiveRedditCredentialPolicy } from '" + moduleName + "';"), 'policy must be imported');
  assert.match(clean, /createSourceLiveRedditCredentialPolicy\(\{\s*violations,\s*redditCredentialLifecycleFormat,\s*redditCredentialLifecycleEvidenceKind,\s*requiredRedditLifecycleOperations,/);
  assert.match(clean, /validateRedditCredentialLifecycleArtifact\(readJson\(schema\.exampleArtifactPath\)/);
  assert.match(clean, /validateRedditCredentialLifecycleArtifact\(lifecycleArtifact, \{/);
  assert.match(clean, /validateArtifactRedaction\(artifact, label\)/);
  assert.doesNotMatch(clean, /function validateRedditCredentialLifecycleOperations\(/);
}
test('original source-live checker must call extracted Reddit credential lifecycle policy', () => {
  assertWired(checker);
});
test('removed or commented import cannot pass the integration gate', () => {
  const statement = "import { createSourceLiveRedditCredentialPolicy } from '" + moduleName + "';";
  assert.ok(checker.includes(statement));
  assert.throws(() => assertWired(checker.replace(statement, '')));
  assert.throws(() => assertWired(checker.replace(statement, '/* ' + statement + ' */')));
});
test('disabling artifact validator or redaction delegation cannot pass the gate', () => {
  assert.ok(checker.includes('validateRedditCredentialLifecycleArtifact(lifecycleArtifact, {'));
  assert.throws(() => assertWired(checker.replace('validateRedditCredentialLifecycleArtifact(lifecycleArtifact, {', '/* validator removed */ (artifact, {')));
  assert.throws(() => assertWired(checker.replace('validateArtifactRedaction(artifact, label)', '/* redaction removed */')));
});
