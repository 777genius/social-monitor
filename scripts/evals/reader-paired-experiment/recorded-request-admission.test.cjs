'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { OLD, FINAL, revisionSource } = require('./revision-source.cjs');
const { replayHost } = require('./replay-host.cjs');
const { syntheticTape } = require('./full-selector-fixture.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
const { verifyRecordedRequestAdmission } = require('./recorded-request-admission.cjs');
test('immutable admission preserves OLD no-assessment policy and verifies compatible P2 commands without an executor', () => {
  for (const revision of [OLD, FINAL]) {
    const host = replayHost(), source = revisionSource(process.cwd(), revision, '2026-09-05T21:59:00.000Z', host);
    const events = syntheticTape().files['models.jsonl'].filter(r => r.event.kind === 'envelope_verified');
    for (const { event } of events) {
      if (revision === OLD && event.command.purpose.includes('assess_source_content')) {
        assert.throws(() => verifyRecordedRequestAdmission(source, event.command, event.result), /purpose is not admitted/);
        continue;
      }
      const admission = verifyRecordedRequestAdmission(source, event.command, event.result);
      assert.equal(admission.canonicalRequestSha256, event.result.executionAttestation.canonicalRequestSha256);
      assert.equal(admission.profile.reasoningEffort, 'high');
    }
    const files = Object.keys(source.identity().closure);
    if (revision === FINAL) assert.ok(files.includes('apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs'));
    assert.ok(!files.some(f => /executor|client/.test(f)));
    assert.throws(() => source.load('apps/agent-runtime/src/subscription-runtime-executor.ts'), /entry_outside_source_closure/);
    host.close();
  }
});
test('changed canonical hash, prompt, timeout, identity or model policy cannot retain a valid receipt', () => {
  const host = replayHost(), source = revisionSource(process.cwd(), FINAL, '2026-09-05T21:59:00.000Z', host);
  const original = syntheticTape().files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event;
  for (const mutate of [
    e => { e.result.executionAttestation.canonicalRequestSha256 = '0'.repeat(64); },
    e => { e.command.prompt += ' '; },
    e => { e.command.timeoutMs--; },
    e => { e.command.requestId += '-other'; },
    e => { e.command.controls.reasoningEffort = 'low'; },
  ]) {
    const changed = clone(original); mutate(changed);
    assert.throws(() => verifyRecordedRequestAdmission(source, changed.command, changed.result));
  }
  host.close();
});
test('admission-only virtual filesystem is unavailable to other source modules and policy mode', () => {
  const source = revisionSource(process.cwd(), FINAL, '2026-09-05T21:59:00.000Z');
  assert.throws(() => source.load('apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts'), /entry_outside_source_closure/);
});
