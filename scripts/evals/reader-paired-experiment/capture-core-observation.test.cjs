'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { captureCore } = require('./capture-core-observation.cjs');
const { DAYS } = require('./frozen-input.cjs');
const { captureCoreFixture: fixture } = require('./capture-core-fixture.cjs');

test('seven original capture-core days retain every ordered row, timestamp, authority and read interval', () => {
  const f = fixture();
  try {
    const observed = captureCore(f.args);
    assert.deepEqual(observed.map(o => o.day), DAYS);
    observed.forEach((o, i) => {
      assert.deepEqual(o.snapshot, f.records[i].snapshot);
      assert.deepEqual(o.observationQuery, f.records[i].query);
      assert.deepEqual(o.interests, f.controls.interests);
      assert.equal(o.startedAt, f.records[i].startedAt);
      assert.equal(o.endedAt, f.records[i].endedAt);
      assert.equal(o.provenance.independentOriginVerified, false);
      assert.equal(o.provenance.modelInvocationHistory, 'not_recorded');
      assert.equal(o.snapshot.candidates.length, 4);
      assert.equal(o.snapshot.supplementalItems.length, 12);
      assert.equal(o.seal, undefined);
      assert.throws(() => { o.snapshot.candidates[0].item.observedAt = 'changed'; }, TypeError);
    });
  } finally { f.cleanup(); }
});

test('even rehashed structural receipt fixtures reject scope, source joins, interests, query filters and missing days', () => {
  const cases = [
    [v => { v.records.pop(); }, /seven_UTC_days/],
    [v => { v.records[0].snapshot.candidates[0].item.workspaceId = 'other'; }, /scope mismatch/],
    [v => { v.records[0].snapshot.sourceContent.pop(); }, /coverage mismatch/],
    [v => { v.records[0].snapshot.sourceContent[0].sourceItemId = 'other'; }, /source-content join/],
    [v => { v.records[0].query.interestId = 'extra'; }, /snapshot_control_query/],
    [v => { v.controls.queries[0].rankingQuery.limit = 201; }, /ranking_control_query/],
    [v => { v.controls.queries[0].absentFilters = []; }, /ranking_control_query/],
    [v => { v.controls.interests.pop(); }, /interest_inventory_incomplete/],
    [v => { v.controls.interests[0].result.interest.workspaceId = 'other'; }, /configured_interest_invalid/],
    [v => { v.records[0].endedAt = '2026-09-09T11:47:10.524Z'; }, /capture_interval/],
    [v => { v.records[0].snapshot.exhausted = false; }, /incomplete snapshot/],
  ];
  for (const [mutate, error] of cases) {
    const f = fixture(mutate);
    try { assert.throws(() => captureCore(f.args), error); } finally { f.cleanup(); }
  }
});

test('original file hashes reject silent timestamp edits and changed receipts', () => {
  for (const name of ['2026-08-30.json', 'capture-receipt.json', 'host-receipt.json', 'controls.json']) {
    const f = fixture();
    try {
      fs.appendFileSync(path.join(f.args.directory, name), ' ');
      assert.throws(() => captureCore(f.args), /SHA256 mismatch/);
    } finally { f.cleanup(); }
  }
});
