import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validNotExecutedModelFields,
  runtimeFields,
} from '../lib/reader-summary-publication-runtime-policy.mjs';

const nullModel = () => ({
  summaryModel: null, physicalModel: null, provider: null, runtime: null,
  runtimeVersion: null, reasoningEffort: null, launcherSha256: null,
  summaryContentSha256: null, topicMapSha256: null,
  attestationSetSha256: null, completedTaskCount: 0, topicLabeler: null,
});

test('not_executed requires every original null field and zero completed tasks', () => {
  assert.equal(validNotExecutedModelFields(nullModel(), { execution: 'not_executed' }), true);
  assert.equal(validNotExecutedModelFields({ ...nullModel(), summaryModel: 'agent-runtime' }, { execution: 'not_executed' }), false);
  for (const field of Object.keys(nullModel())) {
    const mutated = { ...nullModel(), [field]: undefined };
    assert.equal(validNotExecutedModelFields(mutated, { execution: 'not_executed' }), false, field);
  }
  assert.equal(validNotExecutedModelFields({ ...nullModel(), completedTaskCount: '0' }, { execution: 'not_executed' }), false);
});

test('other provenance states retain the permissive early return', () => {
  for (const execution of ['attested', 'completed', undefined, null]) {
    assert.equal(validNotExecutedModelFields({}, { execution }), true);
  }
});

test('not_executed projects exactly execution and reason, without other fields', () => {
  const fields = runtimeFields({ runtimeExecution: 'not_executed', runtimeExecutionReason: 'no_signal', summaryModel: 'ignored' }, { execution: 'not_executed' });
  assert.deepEqual(fields, { execution: 'not_executed', reason: 'no_signal' });
  assert.deepEqual(Object.keys(runtimeFields({}, { execution: 'not_executed' })), ['execution', 'reason']);
});

test('attested projects exactly the original ordered 13 fields', () => {
  const model = {
    runtimeExecution: 'attested', summaryModel: 'agent-runtime', physicalModel: 'gpt-5.6-sol',
    provider: 'codex', runtime: 'subscription-runtime-cli', runtimeVersion: '1.2.3',
    reasoningEffort: 'high', launcherSha256: 'a', summaryContentSha256: 'b',
    topicMapSha256: 'c', attestationSetSha256: 'd', completedTaskCount: 2,
    topicLabeler: { mode: 'agent-runtime' }, runtimeExecutionReason: 'ignored', extra: 'ignored',
  };
  const fields = runtimeFields(model, { execution: 'attested' });
  assert.deepEqual(Object.keys(fields), [
    'execution', 'summaryModel', 'physicalModel', 'provider', 'runtime',
    'runtimeVersion', 'reasoningEffort', 'launcherSha256', 'summaryContentSha256',
    'topicMapSha256', 'attestationSetSha256', 'completedTaskCount', 'topicLabeler',
  ]);
  assert.equal(fields.summaryModel, 'agent-runtime');
  assert.equal(fields.execution, 'attested');
  assert.equal(Object.hasOwn(fields, 'extra'), false);
  assert.equal(Object.hasOwn(fields, 'reason'), false);
});

test('non-not_executed states retain own keys with undefined values', () => {
  const fields = runtimeFields({}, { execution: 'unknown' });
  assert.equal(Object.keys(fields).length, 13);
  assert.equal(Object.hasOwn(fields, 'summaryModel'), true);
  assert.equal(fields.summaryModel, undefined);
});

test('projection does not mutate a frozen source model', () => {
  const model = Object.freeze({ runtimeExecution: 'attested', summaryModel: 'foo' });
  const projected = runtimeFields(model, { execution: 'attested' });
  assert.equal(projected.summaryModel, 'foo');
  assert.deepEqual(Object.keys(model), ['runtimeExecution', 'summaryModel']);
});

test('provenance access preserves original thrown TypeError for null', () => {
  assert.throws(() => validNotExecutedModelFields(nullModel(), null), TypeError);
  assert.throws(() => runtimeFields({}, null), TypeError);
});
