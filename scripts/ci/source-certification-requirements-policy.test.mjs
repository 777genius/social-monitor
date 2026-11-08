import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceCertificationRequirementPolicy } from '../lib/source-certification-requirements-policy.mjs';

const path = 'ops/ingestion/source-provider-certification.json';
const signalId = 'rss-live-response';
const command = 'npm run check:rss';
const artifactEnv = 'RSS_EVIDENCE_PATH';
function fixture() {
  return {
    fixtureMode: 'deterministic_no_network',
    certifiedProviders: [
      {
        providerKey: 'rss', readinessState: 'enabled_beta', runtimeReadiness: 'fixture_ready',
        liveBetaReady: false, liveBetaBlockers: ['live evidence pending'],
        liveEvidenceRequirements: [{
          signalId, description: 'Verify RSS live provider', verificationCommand: command,
          requiredFor: 'external_beta', artifactEnv,
        }],
      },
      { providerKey: 'fake-source', readinessState: 'certification_ready',
        runtimeReadiness: 'fixture_ready', liveBetaReady: false },
    ],
  };
}
function run(mutate = () => {}, opts = {}) {
  const sourceCertification = fixture(), evidence = { externalBetaStatus: 'hold_until_live_provider_evidence' };
  const requiredProviderSignals = new Map([['rss', new Set([signalId])]]);
  const expectedCertificationRequirementCommands = new Map([['rss', command]]);
  const expectedCertificationArtifactEnvs = new Map([['rss', artifactEnv]]);
  const fixtureOnlyProviders = new Set(['fake-source']);
  const violations = [], commands = [];
  mutate({ sourceCertification, evidence, requiredProviderSignals, expectedCertificationRequirementCommands,
    expectedCertificationArtifactEnvs, fixtureOnlyProviders });
  const { validateSourceCertification } = createSourceCertificationRequirementPolicy({
    sourceCertification, sourceCertificationPath: path,
    requiredProviderSignals, expectedCertificationRequirementCommands, expectedCertificationArtifactEnvs,
    fixtureOnlyProviders, evidence, violations,
    validateCommand: (value, label) => { commands.push({ value, label }); if (opts.checkCommand) opts.checkCommand(value, label, violations); },
  });
  validateSourceCertification();
  return { violations, commands };
}

test('valid fixture-only and pending RSS certification remains accepted', () => {
  assert.deepEqual(run().violations, []);
});

test('expected live command is still validated through caller-owned script guard', () => {
  const result = run();
  assert.deepEqual(result.commands, [{
    value: command, label: 'provider "rss" requirement "' + signalId + '" verificationCommand',
  }]);
});

test('missing required provider fails closed', () => {
  const result = run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders = sourceCertification.certifiedProviders.filter(x => x.providerKey !== 'rss');
  });
  assert.deepEqual(result.violations, [path + ': missing certified provider "rss"']);
});

test('fixture source must remain deterministic and offline', () => {
  assert.deepEqual(run(({ sourceCertification }) => { sourceCertification.fixtureMode = 'live_network'; }).violations,
    [path + ': fixture certification must remain deterministic_no_network']);
});

test('required provider readiness state cannot silently leave enabled beta', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].readinessState = 'disabled';
  }).violations, [path + ': provider "rss" must stay enabled_beta in fixture gate']);
});

test('unrecognized runtime readiness is rejected', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].runtimeReadiness = 'unknown';
  }).violations, [path + ': provider "rss" has unsupported runtimeReadiness']);
});

test('live beta ready requires passed live evidence status', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].liveBetaReady = true;
  }).violations, [path + ': provider "rss" cannot be liveBetaReady before evidence passes']);
});

test('pending live beta always requires explicit blockers', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].liveBetaBlockers = [];
  }).violations, [path + ': provider "rss" must declare live beta blockers']);
});

test('no live requirement list fails closed', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].liveEvidenceRequirements = [];
  }).violations, [path + ': provider "rss" must expose liveEvidenceRequirements']);
});

test('duplicate live signal evidence requirement is not silently accepted', () => {
  const result = run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].liveEvidenceRequirements.push({
      ...sourceCertification.certifiedProviders[0].liveEvidenceRequirements[0],
    });
  });
  assert.ok(result.violations.includes(path + ': provider "rss" has duplicate liveEvidenceRequirement "' + signalId + '"'));
  assert.equal(result.commands.length, 2);
});

test('unsupported requirement also reports the missing mandatory signal', () => {
  const violations = run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].liveEvidenceRequirements[0].signalId = 'unsupported';
  }).violations;
  assert.deepEqual(violations, [
    path + ': provider "rss" has unsupported liveEvidenceRequirement "unsupported"',
    path + ': provider "rss" missing liveEvidenceRequirement "' + signalId + '"',
  ]);
});

test('empty requirement description remains invalid', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[0].liveEvidenceRequirements[0].description = '';
  }).violations, [path + ': provider "rss" requirement "' + signalId + '" must define description']);
});

test('incorrect verification command, approval scope and artifact env remain invalid', () => {
  const result = run(({ sourceCertification }) => {
    const x = sourceCertification.certifiedProviders[0].liveEvidenceRequirements[0];
    x.verificationCommand = 'npm run invalid';
    x.requiredFor = 'internal_only';
    x.artifactEnv = 'WRONG_ARTIFACT';
  });
  assert.deepEqual(result.violations, [
    path + ': provider "rss" requirement "' + signalId + '" must use expected certification command',
    path + ': provider "rss" requirement "' + signalId + '" must be requiredFor=external_beta',
    path + ': provider "rss" requirement "' + signalId + '" must use expected artifactEnv',
    path + ': provider "rss" requirement "' + signalId + '" artifactEnv must end with _EVIDENCE_PATH',
  ]);
});

test('caller-owned script validation can add an independent failure', () => {
  const result = run(() => {}, { checkCommand: (value, label, v) => {
    v.push(label + ': script registry rejected ' + value);
  } });
  assert.deepEqual(result.violations, [
    'provider "rss" requirement "' + signalId + '" verificationCommand: script registry rejected ' + command,
  ]);
});

test('enabled beta provider without an expected policy entry cannot bypass certification', () => {
  const result = run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders.push({
      providerKey: 'unexpected', readinessState: 'enabled_beta', runtimeReadiness: 'fixture_ready',
    });
  });
  assert.deepEqual(result.violations, [
    path + ': enabled_beta provider "unexpected" must be covered by source live certification evidence',
  ]);
});

test('fake fixture provider may not claim live beta readiness', () => {
  const result = run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders[1].liveBetaReady = true;
  });
  assert.deepEqual(result.violations, [path + ': fake-source must never claim live beta readiness']);
});

test('fake source must remain present and fixture-only', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    sourceCertification.certifiedProviders.pop();
  }).violations, [path + ': fake-source must remain certified as fixture-only evidence']);
});

test('fake source readiness and runtime state are both checked', () => {
  assert.deepEqual(run(({ sourceCertification }) => {
    const fake = sourceCertification.certifiedProviders[1];
    fake.readinessState = 'enabled_beta';
    fake.runtimeReadiness = 'live_beta_ready';
  }).violations, [
    path + ': fake-source readinessState must be certification_ready',
    path + ': fake-source runtimeReadiness must be fixture_ready',
  ]);
});
