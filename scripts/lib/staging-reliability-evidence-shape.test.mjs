import assert from "node:assert/strict";
import test from "node:test";
import {
  getPath,
  hasNonEmptyEvidence,
  isIsoTimestamp,
  isRecord,
  isSupportedEvidenceType,
  matchesEvidenceType,
  objectsEqual,
  parseIsoTimestampMs,
  sortObject,
} from "./staging-reliability-evidence-shape.mjs";

test("nested and inherited evidence paths retain original lookup rules", () => {
  const inherited = Object.create({ source: { score: 3 } });
  assert.equal(getPath(inherited, "source.score"), 3);
  assert.equal(getPath({ source: { score: 2 } }, "source.score"), 2);
  assert.equal(getPath({ source: null }, "source.score"), undefined);
  assert.equal(getPath({ source: [] }, "source.score"), undefined);
  assert.equal(getPath({}, "missing"), undefined);
});

test("evidence presence keeps string, array, and object semantics", () => {
  assert.equal(hasNonEmptyEvidence("  ok  "), true);
  assert.equal(hasNonEmptyEvidence("  "), false);
  assert.equal(hasNonEmptyEvidence([null]), true);
  assert.equal(hasNonEmptyEvidence([]), false);
  assert.equal(hasNonEmptyEvidence({ field: null }), true);
  assert.equal(hasNonEmptyEvidence({}), false);
  assert.equal(hasNonEmptyEvidence(null), false);
  assert.equal(isRecord(Object.create(null)), true);
  assert.equal(isRecord([]), false);
});

test("staging evidence schema accepts original fifteen field types", () => {
  const accepted = [
    ["non_empty_string", "value"],
    ["iso_timestamp", "2026-11-07T00:00:00Z"],
    ["boolean_true", true],
    ["boolean_false", false],
    ["at_least_three_integer", 3],
    ["positive_integer", 1],
    ["non_negative_integer", 0],
    ["non_empty_string_array", ["a"]],
    ["non_empty_object", { x: null }],
    ["non_empty_object_array", [{ x: true }]],
    ["durable_provider_key", "github-issues"],
    ["scheduled_idempotency_key", "scheduled:id"],
    ["auto_summary_idempotency_key", "auto-summary:id"],
    ["scan_status_succeeded", "SUCCEEDED"],
    ["terminal_summary_status", "no_signal"],
  ];
  for (const [kind, value] of accepted) {
    assert.equal(isSupportedEvidenceType(kind), true, kind);
    assert.equal(matchesEvidenceType(value, kind), true, kind);
  }
  assert.equal(isSupportedEvidenceType("unknown"), false);
  assert.equal(matchesEvidenceType("value", "unknown"), false);
});

test("type-specific invalid values and timestamp edge cases stay rejected", () => {
  assert.equal(matchesEvidenceType(" ", "non_empty_string"), false);
  assert.equal(matchesEvidenceType(2, "at_least_three_integer"), false);
  assert.equal(matchesEvidenceType(0, "positive_integer"), false);
  assert.equal(matchesEvidenceType(-1, "non_negative_integer"), false);
  assert.equal(matchesEvidenceType([""], "non_empty_string_array"), false);
  assert.equal(matchesEvidenceType([{}], "non_empty_object_array"), false);
  assert.equal(matchesEvidenceType("evil", "durable_provider_key"), false);
  assert.equal(matchesEvidenceType("scheduled:", "scheduled_idempotency_key"), false);
  assert.equal(matchesEvidenceType("auto-summary:", "auto_summary_idempotency_key"), false);
  assert.equal(matchesEvidenceType("FAILED", "scan_status_succeeded"), false);
  assert.equal(matchesEvidenceType("pending", "terminal_summary_status"), false);
  assert.equal(isIsoTimestamp("2026-11-07T03:00:00+02:00"), true);
  assert.equal(isIsoTimestamp("2026-11-07"), false);
  assert.equal(isIsoTimestamp(null), false);
  assert.equal(parseIsoTimestampMs(null), undefined);
  assert.equal(parseIsoTimestampMs("not a date"), undefined);
});

test("record comparison sorts object keys but preserves array ordering", () => {
  const a = { b: { z: 1, a: [1, { y: 2, x: 3 }] }, a: 9 };
  const b = { a: 9, b: { a: [1, { x: 3, y: 2 }], z: 1 } };
  assert.equal(objectsEqual(a, b), true);
  assert.deepEqual(sortObject(b), sortObject(a));
  assert.equal(objectsEqual({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(objectsEqual([], []), false);
  assert.equal(objectsEqual(null, {}), false);
});
