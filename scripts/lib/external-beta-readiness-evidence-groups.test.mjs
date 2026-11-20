import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateExternalBetaEvidenceGroups } from './external-beta-readiness-evidence-groups.mjs';

const ids = [
  'release-baseline-freeze', 'durable-runtime-proof', 'production-auth-finalization',
  'source-provider-live-certification', 'credential-secret-runtime-flow',
  'rabbitmq-staging-reliability-drill', 'postgres-restore-migration-drill',
  'durable-backend-e2e-loop', 'summary-quality-feedback-hardening',
  'operational-support-package', 'capacity-envelope-beta-ring-decision',
  'release-artifact-evidence', 'security-final-sweep', 'no-go-cleanup',
];

function fixture(decision = 'hold') {
  const contract = {
    externalBetaDecision: decision,
    requiredEvidenceGroups: ids.map((groupId) => ({
      groupId, status: 'passed', owner: 'owner', blocksExternalBeta: true,
      verificationCommands: ['npm run check:fixture'],
      requiredArtifacts: ['existing'], exitCondition: 'done',
    })),
  };
  const violations = [];
  const run = () => validateExternalBetaEvidenceGroups({
    contract, scripts: { 'check:fixture': 'node fixture.mjs' },
    existsSync: (path) => path === 'existing',
    contractPath: 'readiness.json', violations,
  });
  return { contract, violations, run };
}

test('all required groups passed allow hold and go', () => {
  for (const decision of ['hold', 'go']) {
    const x = fixture(decision);
    x.run();
    assert.deepEqual(x.violations, []);
  }
});

test('pending evidence blocks go but preserves hold', () => {
  const x = fixture('go');
  x.contract.requiredEvidenceGroups[0].status = 'hold';
  x.run();
  assert.deepEqual(x.violations, [
    'readiness.json: externalBetaDecision cannot be go while blocking evidence is not passed',
  ]);
  const y = fixture('hold');
  y.contract.requiredEvidenceGroups[0].status = 'hold';
  y.run();
  assert.deepEqual(y.violations, []);
});

test('duplicate, unsupported and missing groups retain diagnostic sequence', () => {
  const x = fixture();
  const removed = x.contract.requiredEvidenceGroups.pop().groupId;
  x.contract.requiredEvidenceGroups.push({ ...x.contract.requiredEvidenceGroups[0] });
  x.contract.requiredEvidenceGroups.push({ ...x.contract.requiredEvidenceGroups[0], groupId: 'unexpected' });
  x.run();
  assert.deepEqual(x.violations, [
    'readiness.json: duplicate evidence group "release-baseline-freeze"',
    'readiness.json: unsupported evidence group "unexpected"',
    'readiness.json: missing required evidence group "' + removed + '"',
  ]);
});

test('malformed group checks keep original diagnostic order', () => {
  const x = fixture();
  Object.assign(x.contract.requiredEvidenceGroups[0], {
    status: 'invalid', owner: ' ', blocksExternalBeta: false,
    verificationCommands: ['npm run missing'], requiredArtifacts: ['absent'],
    exitCondition: '',
  });
  x.run();
  assert.deepEqual(x.violations, [
    'readiness.json: evidence group "release-baseline-freeze" has unsupported status "invalid"',
    'readiness.json: evidence group "release-baseline-freeze" must define owner',
    'readiness.json: evidence group "release-baseline-freeze" must block external beta until passed',
    'readiness.json: evidence group "release-baseline-freeze" references missing script "missing"',
    'readiness.json: evidence group "release-baseline-freeze" references missing artifact "absent"',
    'readiness.json: evidence group "release-baseline-freeze" must define exitCondition',
  ]);
});

test('missing group collection emits required group violations in original order', () => {
  const x = fixture('go');
  delete x.contract.requiredEvidenceGroups;
  x.run();
  assert.deepEqual(x.violations, ids.map((id) =>
    'readiness.json: missing required evidence group "' + id + '"'));
});
