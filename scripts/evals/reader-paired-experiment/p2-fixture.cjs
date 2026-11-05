'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { syntheticTape } = require('./full-selector-fixture.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
const { hash } = require('./capture-owner-receipt.cjs');
const { sha } = require('./revision-source.cjs');
// A seal-shaped synthetic fixture tests integrity checks only. The reader
// must keep independentOriginVerified false, including its nominal case.
function p2Fixture(mutate = () => {}) {
  const tape = syntheticTape(), input = tape.files['inputs.json'];
  Object.assign(tape.files, { 'rank-command.json': { command: {}, presentKeys: [] },
    'canonical-bindings.json': {}, 'promotion.json': {}, 'preparation.json': {}, 'selection.json': {},
    'candidate-status.json': [...input.primaryIds, ...input.supplementalIds].map(feedItemId => ({ feedItemId, status: 'pending' })) });
  tape.seal.complete = true; tape.seal.failures = [];
  tape.seal.observationCounts = { snapshots: 1, promotion: 1, preparation: 1, selections: 1,
    relationAttempts: tape.files['relations.jsonl'].filter(r => r.event.phase === 'attempt').length,
    modelRequests: tape.files['models.jsonl'].filter(r => r.event.kind === 'invocation_started').length };
  mutate(tape);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'controlled-p2-'));
  const files = Object.entries(tape.files).map(([name, value]) => {
    const bytes = name.endsWith('.jsonl') ? value.map(v => JSON.stringify(v)).join('\n') + '\n' : JSON.stringify(value) + '\n';
    fs.writeFileSync(path.join(directory, name), bytes);
    return { name, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) };
  });
  const bytes = JSON.stringify({ ...tape.seal, files }), filename = path.join(directory, 'seal.json');
  fs.writeFileSync(filename, bytes);
  return { ref: { path: filename, sha256: sha(bytes) }, directory, tape,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
// Artificial trust-boundary input for unit tests only, never production evidence.
function ownerContractReceipt(tape) {
  const manifest = tape.files['controls.json'].manifest, started = tape.files['started.json'];
  return { format: 'paired-p2-local-owner-receipt.v1', authority: 'local_execution_owner_attestation',
    action: 'actual_p2_apply', captureSealSha256: tape.sealSha256, scope: clone(started.scope),
    operationId: manifest.operation, commandManifestSha256: hash(manifest),
    reviewedSourceCommit: 'a'.repeat(40), deployedSourceCommit: 'a'.repeat(40),
    sourceSha256: manifest.sourceSha256, imageId: `sha256:${'b'.repeat(64)}`, ownedContainerId: 'c'.repeat(64),
    runtime: clone(manifest.runtime), startedAt: new Date(started.atMs - 100).toISOString(),
    endedAt: new Date(started.atMs + 60000).toISOString(), terminal: { status: 'exited', exitCode: 0 } };
}
module.exports = { p2Fixture, ownerContractReceipt };
