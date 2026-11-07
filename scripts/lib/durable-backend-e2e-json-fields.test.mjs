import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readRecord,
  readString,
  optionalString,
  readNumber,
  readStringArray,
  readObjectArray,
  readFirst,
  isRecord,
} from './durable-backend-e2e-json-fields.ts';

test('readRecord accepts records and rejects null and arrays with stable errors', () => {
  const item = { id: 'abc' };
  assert.equal(readRecord({ item }, 'item'), item);
  for (const value of [null, [], 'text', undefined]) {
    assert.throws(() => readRecord({ item: value }, 'item'), /^Error: Expected item to be an object$/);
  }
});

test('required and optional strings retain their original values', () => {
  const source = { id: '  token  ', empty: ' ', number: 3 };
  assert.equal(readString(source, 'id'), '  token  ');
  assert.equal(optionalString(source, 'id'), '  token  ');
  for (const field of ['empty', 'number', 'missing']) {
    assert.throws(() => readString(source, field), new RegExp('^Error: Expected ' + field + ' to be a non-empty string$'));
    assert.equal(optionalString(source, field), undefined);
  }
});

test('readNumber only accepts finite numbers', () => {
  assert.equal(readNumber({ n: -0 }, 'n'), -0);
  assert.equal(readNumber({ n: 12.5 }, 'n'), 12.5);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '-1', null, undefined]) {
    assert.throws(() => readNumber({ n: value }, 'n'), /^Error: Expected n to be a finite number$/);
  }
});

test('readStringArray rejects empty elements while preserving empty arrays', () => {
  const values = ['one', ' two '];
  assert.equal(readStringArray({ names: values }, 'names'), values);
  assert.deepEqual(readStringArray({ names: [] }, 'names'), []);
  for (const input of [['good', ''], [4], 'str', null, undefined]) {
    assert.throws(() => readStringArray({ names: input }, 'names'), /^Error: Expected names to be a string array$/);
  }
});

test('readObjectArray accepts records and preserves source array identity', () => {
  const values = [{ id: 'one' }, { id: 2 }];
  assert.equal(readObjectArray({ entries: values }, 'entries'), values);
  assert.deepEqual(readObjectArray({ entries: [] }, 'entries'), []);
  for (const input of [[{}, null], [[]], { id: 1 }, undefined]) {
    assert.throws(() => readObjectArray({ entries: input }, 'entries'), /^Error: Expected entries to be an object array$/);
  }
});

test('readFirst retains original first item and stable missing-item errors', () => {
  const item = { id: 'x' };
  assert.equal(readFirst([item, {}], 'signal'), item);
  for (const values of [[], [undefined]]) {
    assert.throws(() => readFirst(values, 'signal'), /^Error: Expected at least one signal$/);
  }
});

test('isRecord keeps existing object/null/array semantics', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord(new Date('2020-01-01')), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('text'), false);
});
