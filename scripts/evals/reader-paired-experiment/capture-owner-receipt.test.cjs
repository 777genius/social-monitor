'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { p2OwnerReceipt, verifyOwnerInvocation } = require('./capture-owner-receipt.cjs');
const { syntheticTape } = require('./full-selector-fixture.cjs');
const { sha } = require('./revision-source.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
// Tests inject an artificial local owner at the explicit trust boundary. Passing
// that structural contract is NOT evidence of a production execution. No fixture
// receipt is distributed as a trusted capture or used in a real experiment.
function fixture() {
  const tape = syntheticTape();
  delete tape.seal.synthetic; delete tape.files['controls.json'].synthetic;
  const receipt = require('./p2-fixture.cjs').ownerContractReceipt(tape);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'controlled-owner-contract-'));
  const write = () => {
    const bytes = JSON.stringify(receipt), filename = path.join(directory, 'owner.json');
    fs.writeFileSync(filename, bytes); return { path: filename, sha256: sha(bytes) };
  };
  return { tape, receipt, write, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
test('only the separately supplied owner SHA anchors the receipt; self-declared trust and native quota cannot substitute', () => {
  const f = fixture();
  try {
    f.receipt.trustedAnchor = true;
    const ref = f.write();
    assert.throws(() => p2OwnerReceipt(f.tape, ref, []), /out_of_band_anchor_missing/);
    assert.throws(() => p2OwnerReceipt(f.tape, ref, ['d'.repeat(64)]), /out_of_band_anchor_missing/);
    const origin = p2OwnerReceipt(f.tape, ref, [ref.sha256]);
    assert.equal(origin.receiptSha256, ref.sha256);
    assert.equal(origin.authority, 'local_execution_owner_attestation');
    assert.equal(origin.remoteExecutionCryptographicallyAuthenticated, false);
    f.receipt.format = 'native-quota-receipt.v1';
    const native = f.write();
    assert.throws(() => p2OwnerReceipt(f.tape, native, [native.sha256]), /contract_invalid/);
  } finally { f.cleanup(); }
});
test('anchored receipt still requires exact capture, command, operation, runtime, image, container and completed lifecycle joins', () => {
  const mutations = [
    f => { f.receipt.captureSealSha256 = 'e'.repeat(64); },
    f => { f.receipt.commandManifestSha256 = 'e'.repeat(64); },
    f => { f.receipt.operationId += ':other'; },
    f => { f.receipt.scope.workspaceId = 'other'; },
    f => { f.receipt.reviewedSourceCommit = 'f'.repeat(40); },
    f => { f.receipt.sourceSha256 = 'e'.repeat(64); },
    f => { f.receipt.imageId = 'mutable:latest'; },
    f => { f.receipt.ownedContainerId = 'name-only'; },
    f => { f.receipt.runtime.launcherSha256 = 'e'.repeat(64); },
    f => { f.receipt.terminal.exitCode = 1; },
    f => { f.receipt.terminal.status = 'running'; },
    f => { f.receipt.startedAt = f.receipt.endedAt; },
    f => { f.tape.files['models.jsonl'][0].atMs = Date.parse(f.receipt.endedAt) + 1; },
    f => { f.tape.seal.synthetic = true; },
    f => { f.receipt.synthetic = true; },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    try { mutate(f); const ref = f.write(); assert.throws(() => p2OwnerReceipt(f.tape, ref, [ref.sha256])); }
    finally { f.cleanup(); }
  }
});
test('receipt bytes and selected model runtime cannot be substituted after independent pinning', () => {
  const f = fixture();
  try {
    const ref = f.write(), origin = p2OwnerReceipt(f.tape, ref, [ref.sha256]);
    const end = f.tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event;
    verifyOwnerInvocation(origin, end.command, end.result);
    for (const key of ['runtimeEngine', 'runtimePackageVersion', 'launcherSha256']) {
      const result = clone(end.result); result.executionAttestation[key] = 'wrong';
      assert.throws(() => verifyOwnerInvocation(origin, end.command, result), /runtime_mismatch/);
    }
    const command = clone(end.command); command.controls.model = 'wrong';
    assert.throws(() => verifyOwnerInvocation(origin, command, end.result), /model_mismatch/);
    fs.appendFileSync(ref.path, ' ');
    assert.throws(() => p2OwnerReceipt(f.tape, ref, [ref.sha256]), /SHA256 mismatch/);
  } finally { f.cleanup(); }
});

test('reader and actual parsers retain the admitted local receipt binding; copied provenance cannot grant authority', async () => {
  const { p2Fixture, ownerContractReceipt } = require('./p2-fixture.cjs');
  const { p2Observation, originFor } = require('./p2-observation.cjs');
  const { controlledFixture } = require('./controlled-fixture.cjs');
  const { evaluationView, controlsDigest } = require('./controlled-evaluation-view.cjs');
  const { fullSelector } = require('./revision-full-selector.cjs');
  const { FINAL } = require('./revision-source.cjs');
  // Deliberately inject an artificial trusted owner for contract coverage. The
  // generated files are deleted; this test does not establish real provenance.
  const f = p2Fixture(tape => { delete tape.seal.synthetic; delete tape.files['controls.json'].synthetic; });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'controlled-owner-parser-'));
  try {
    const tape = p2Observation(f.ref).tape, receipt = ownerContractReceipt(tape);
    const bytes = JSON.stringify(receipt), filename = path.join(directory, 'owner.json');
    fs.writeFileSync(filename, bytes);
    const ref = { ...f.ref, ownerReceipt: { path: filename, sha256: sha(bytes) } };
    const admitted = p2Observation(ref, [sha(bytes)]), c = controlledFixture().controls;
    const observation = admitted.observation;
    assert.equal(originFor(admitted.tape).receiptSha256, sha(bytes));
    const declaration = { kind: 'common_evaluation_controls', observationSha256: observation.observationSha256,
      originalControlsSha256: controlsDigest({ observationQuery: observation.observationQuery,
        observationPresentKeys: observation.observationPresentKeys, controls: observation.originalControls, interests: observation.interests }),
      evaluationControlsSha256: controlsDigest(c) };
    const run = observed => fullSelector({ revision: FINAL, mode: 'CONTROLLED',
      evaluation: evaluationView(observed, c, declaration), modelControls: c.model, responseTapes: [admitted.tape] });
    const result = await run(observation);
    assert.equal(result.replay.consumed.length, 2);
    assert.ok(result.replay.consumed.every(record => record.ownerReceiptSha256 === sha(bytes)));
    assert.deepEqual(result.gaps, []);
    assert.equal(result.quiescence.settled, true);
    assert.equal(result.historicalTimingVerified, false);
    assert.equal(result.artifactId, null);
    const forged = await run(clone(observation));
    assert.ok(forged.gaps.some(g => g.kind === 'observation_origin_unverified'));
    assert.equal(forged.controlledExperimentComplete, false);
  } finally { f.cleanup(); fs.rmSync(directory, { recursive: true, force: true }); }
});
