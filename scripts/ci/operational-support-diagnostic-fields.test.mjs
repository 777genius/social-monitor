import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateDiagnosticFieldAttachment,
  validateSafeDiagnosticFields,
} from '../lib/operational-support-diagnostic-fields.mjs';

const contractPath = 'ops/release/operational-support-package.json';
const contract = { forbiddenDiagnosticFields: ['token', 'secret'] };
const label = (id) => contractPath + ': flow "' + id + '"';

test('valid flow diagnostic fields are accepted without mutation', () => {
  const flow = { flowId: 'f', safeDiagnosticFields: ['trace_id', 'latency_ms'] };
  const before = globalThis.structuredClone(flow);
  const violations = [];
  validateSafeDiagnosticFields(flow, contract, contractPath, violations);
  assert.deepEqual(violations, []);
  assert.deepEqual(flow, before);
});

test('missing, empty and non-array flow fields retain the original diagnostic', () => {
  for (const fields of [undefined, null, [], 'trace_id']) {
    const violations = [];
    validateSafeDiagnosticFields({ flowId: 'f', safeDiagnosticFields: fields }, contract, contractPath, violations);
    assert.deepEqual(violations, [label('f') + ' must define safeDiagnosticFields']);
  }
});

test('invalid syntax and forbidden names retain diagnostic ordering', () => {
  const violations = [];
  validateSafeDiagnosticFields(
    { flowId: 'f', safeDiagnosticFields: ['bad-name', 'API_TOKEN', 'my_secret_key'] },
    contract, contractPath, violations,
  );
  assert.deepEqual(violations, [
    label('f') + ': unsafe diagnostic field "bad-name"',
    label('f') + ': contains forbidden diagnostic field "API_TOKEN"',
    label('f') + ': contains forbidden diagnostic field "my_secret_key"',
  ]);
});

test('multiple forbidden substrings retain duplicate diagnostics and order', () => {
  const violations = [];
  validateSafeDiagnosticFields({ flowId: 'f', safeDiagnosticFields: ['secret_token'] }, contract, contractPath, violations);
  assert.deepEqual(violations, [
    label('f') + ': contains forbidden diagnostic field "secret_token"',
    label('f') + ': contains forbidden diagnostic field "secret_token"',
  ]);
});

test('missing forbidden-field policy preserves format-only validation', () => {
  const violations = [];
  validateSafeDiagnosticFields({ flowId: 'f', safeDiagnosticFields: ['token', 'bad-name'] }, {}, contractPath, violations);
  assert.deepEqual(violations, [label('f') + ': unsafe diagnostic field "bad-name"']);
});

test('missing or empty attachment returns early with one diagnostic', () => {
  for (const fields of [undefined, null, [], 'trace_id']) {
    const violations = [];
    validateDiagnosticFieldAttachment(fields, { flowId: 'f', safeDiagnosticFields: ['trace_id'] }, 'Alert', contract, violations);
    assert.deepEqual(violations, ['Alert must define safeDiagnosticFields']);
  }
});

test('attachment validates names before reporting missing flow fields', () => {
  const violations = [];
  validateDiagnosticFieldAttachment(['bad-field'], {
    flowId: 'f',
    safeDiagnosticFields: ['trace_id', 'correlation_id'],
  }, 'Panel', contract, violations);
  assert.deepEqual(violations, [
    'Panel: unsafe diagnostic field "bad-field"',
    'Panel safeDiagnosticFields missing "trace_id" from flow "f"',
    'Panel safeDiagnosticFields missing "correlation_id" from flow "f"',
  ]);
});

test('attachment accepts all fields and does not mutate flow or attachment', () => {
  const flow = { flowId: 'f', safeDiagnosticFields: ['trace_id'] };
  const fields = ['trace_id', 'extra_field'];
  const violations = [];
  validateDiagnosticFieldAttachment(fields, flow, 'Alert', contract, violations);
  assert.deepEqual(violations, []);
  assert.deepEqual(flow.safeDiagnosticFields, ['trace_id']);
  assert.deepEqual(fields, ['trace_id', 'extra_field']);
});

test('attachment allows absent flow fields exactly as before', () => {
  const violations = [];
  validateDiagnosticFieldAttachment(['trace_id'], { flowId: 'f' }, 'Alert', contract, violations);
  assert.deepEqual(violations, []);
});

test('attachment preserves native TypeError for noniterable required fields', () => {
  assert.throws(() => validateDiagnosticFieldAttachment(
    ['trace_id'], { flowId: 'f', safeDiagnosticFields: 123 }, 'Alert', contract, [],
  ), TypeError);
});

test('flow validation preserves native TypeError for null flow', () => {
  assert.throws(() => validateSafeDiagnosticFields(null, contract, contractPath, []), TypeError);
});

test('nonstring field coercion keeps original diagnostics', () => {
  const violations = [];
  validateSafeDiagnosticFields({ flowId: 'f', safeDiagnosticFields: [null, { foo: true }] }, contract, contractPath, violations);
  assert.deepEqual(violations, [label('f') + ': unsafe diagnostic field "[object Object]"']);
});
