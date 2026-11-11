import assert from 'node:assert/strict';
import test from 'node:test';
// Keep the evidence-boundary regression suite in the existing npm test gate.
import './source-live-provider-evidence-validation.test.mjs';
import {
  getPath,
  matchesEvidenceType,
  isSupportedEvidenceType,
  isRecord,
  isIsoDateString,
} from './source-live-certification-evidence-shape.mjs';

test('nested evidence lookup retains own, inherited and missing-path behavior', () => {
  const source = Object.create({ inherited: { value: 7 } });
  source.own = { nested: true, empty: { '': 'present' } };
  assert.equal(getPath(source, 'own.nested'), true);
  assert.equal(getPath(source, 'inherited.value'), 7);
  assert.equal(getPath(source, 'own.empty.'), 'present');
  assert.equal(getPath(source, 'own.missing'), undefined);
  assert.equal(getPath({ value: null }, 'value.x'), undefined);
  assert.equal(getPath({ rows: [{ id: 1 }] }, 'rows.0.id'), undefined);
  assert.equal(getPath({}, 'missing.x'), undefined);
});

test('record check excludes null and arrays while permitting inherited and custom objects', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord(Object.create(null)), true);
  assert.equal(isRecord(new Date()), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('string'), false);
});

test('evidence type acceptance and rejection preserves six exact variants', () => {
  const samples = [
    ['non_empty_string', ' evidence ', true],
    ['non_empty_string', '   ', false],
    ['positive_integer', 1, true],
    ['positive_integer', 0, false],
    ['positive_integer', 1.5, false],
    ['non_negative_integer', 0, true],
    ['non_negative_integer', -1, false],
    ['boolean_true', true, true],
    ['boolean_true', 1, false],
    ['non_empty_string_array', ['alpha', ' beta '], true],
    ['non_empty_string_array', [], false],
    ['non_empty_string_array', ['alpha', ''], false],
    ['sha256_hex', 'a'.repeat(64), true],
    ['sha256_hex', 'A'.repeat(64), false],
    ['sha256_hex', 'f'.repeat(63), false],
    ['unrecognized', 'evidence', false],
  ];
  for (const [type, value, expected] of samples) {
    assert.equal(matchesEvidenceType(value, type), expected, type);
  }
  for (const type of ['non_empty_string', 'positive_integer', 'non_negative_integer',
    'boolean_true', 'non_empty_string_array', 'sha256_hex']) {
    assert.equal(isSupportedEvidenceType(type), true);
  }
  assert.equal(isSupportedEvidenceType('unsupported'), false);
  assert.equal(isSupportedEvidenceType(null), false);
});

test('timestamp check retains strict ISO form and native Date.parse gate', () => {
  for (const value of [
    '2026-11-07T01:30:00Z',
    '2026-11-07T01:30:00.123456789+02:00',
    '2026-11-07T01:30:00-03:00',
  ]) assert.equal(isIsoDateString(value), true, value);
  for (const value of [
    null, 0, '2026-11-07', '2026-11-07T01:30:00',
    '2026-11-07T01:30:00.1234567890Z', 'not-a-date',
    '2026-99-99T01:30:00Z',
  ]) assert.equal(isIsoDateString(value), false, String(value));
});
