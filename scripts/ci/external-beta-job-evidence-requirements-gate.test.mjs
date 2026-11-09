import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import '../lib/external-beta-job-evidence-requirements.test.mjs';

const checker = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const moduleName = './lib/external-beta-job-evidence-requirements.mjs';
const names = [
  'requiredJobEnvNames',
  'requiredJobOptionalEnvNames',
  'requiredJobEnvAlternatives',
  'requiredJobOutputArtifacts',
  'requiredSourceLiveCertificationJobIds',
];

function assertLiveWiring(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*'\.\/lib\/external-beta-job-evidence-requirements\.mjs';/;
  const match = importPattern.exec(clean);
  assert.ok(match, 'the canonical evidence spec must be actively imported');
  for (const name of names) {
    assert.ok(match[1].split(',').map(value => value.trim()).includes(name), name + ' must be imported');
  }
  assert.match(clean, /createExternalBetaJobArtifactRequirementsPolicy\(\{\s*violations,\s*requiredJobEnvNames,\s*requiredJobOptionalEnvNames,\s*requiredJobEnvAlternatives,\s*requiredJobOutputArtifacts,\s*existsSync,/);
  assert.match(clean, /for\s*\(const requiredSourceJob of requiredSourceLiveCertificationJobIds\)/);
  assert.match(clean, /validateRequiredJobEvidence\s*\(\s*job\s*,\s*label\s*\)\s*;/);
  assert.match(clean, /for\s*\(const requiredSourceJob of requiredSourceLiveCertificationJobIds\)\s*\{\s*if\s*\(!sourceJobs\.has\(requiredSourceJob\)\)\s*\{\s*violations\.push\(/);

  assert.doesNotMatch(clean, /const requiredJobEnvNames\s*=\s*new Map/);
  assert.doesNotMatch(clean, /const requiredJobOutputArtifacts\s*=\s*new Map/);
}

test('the original checker consumes the extracted canonical tables', () => {
  assertLiveWiring(checker);
});

test('commented-out or removed canonical import fails the gate', () => {
  const statement = 'import {';
  assert.ok(checker.startsWith(statement));
  const end = checker.indexOf("} from '" + moduleName + "';") + ("} from '" + moduleName + "';").length;
  assert.ok(end > statement.length);
  assert.throws(() => assertLiveWiring('/*' + checker.slice(0, end) + '*/' + checker.slice(end)));
  assert.throws(() => assertLiveWiring(checker.slice(end)));
});

test('disconnected evidence policy and certification loop fail the gate', () => {
  const artifact = 'requiredJobEnvAlternatives, requiredJobOutputArtifacts,';
  const loop = 'for (const requiredSourceJob of requiredSourceLiveCertificationJobIds)';
  assert.ok(checker.includes(artifact));
  assert.ok(checker.includes(loop));
  assert.throws(() => assertLiveWiring(checker.replace(artifact, 'requiredJobEnvAlternatives,')));
  assert.throws(() => assertLiveWiring(checker.replace(loop, 'for (const requiredSourceJob of [])')));
});

test('removed required-evidence enforcement and disabled certification failure branch are rejected', () => {
  const evidence = 'validateRequiredJobEvidence(job, label);';
  const certification = 'if (!sourceJobs.has(requiredSourceJob)) {';
  assert.ok(checker.includes(evidence));
  assert.ok(checker.includes(certification));
  assert.throws(() => assertLiveWiring(checker.replace(evidence, '/* enforcement removed */')));
  assert.throws(() => assertLiveWiring(checker.replace(certification, 'if (false) {')));
});
