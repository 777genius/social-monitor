import assert from "node:assert/strict";
import test from "node:test";
import {
  isIsoDateString,
  parseIsoTimestampMs,
  sampleSignalFingerprint,
} from "./summary-feedback-evidence-values.mjs";

test("fingerprint preserves field ordering, trim, and JSON escaping", () => {
  assert.equal(sampleSignalFingerprint({
    category: " beta ", sanitizedSignal: 'say "hi"', redactedComment: " A\nB ",
  }), JSON.stringify(["beta", 'say "hi"', "A\nB"]));
  assert.equal(sampleSignalFingerprint({
    category: "", sanitizedSignal: "", redactedComment: "",
  }), '["","",""]');
});

test("fingerprint rejects nonrecords and missing or nonstring fields", () => {
  for (const sample of [
    null, [], "text", 10, { category: "a" },
    { category: "a", sanitizedSignal: "b", redactedComment: null },
  ]) {
    assert.equal(sampleSignalFingerprint(sample), undefined);
  }
});

test("ISO syntax validation retains zone and fractional-second rules", () => {
  for (const value of ["2026-11-07T04:00:00Z", "2026-11-07T04:00:00.123456789+02:00"]) {
    assert.equal(isIsoDateString(value), true);
  }
  for (const value of [
    null, 0, "2026-11-07", "2026-11-07T04:00:00",
    "2026-11-07T04:00:00.1234567890Z", "bad",
  ]) {
    assert.equal(isIsoDateString(value), false);
  }
});

test("timestamp parser accepts parseable nonstrict dates but not nonstrings", () => {
  assert.equal(parseIsoTimestampMs("2026-11-07T04:00:00Z"), Date.parse("2026-11-07T04:00:00Z"));
  assert.equal(parseIsoTimestampMs("2026-11-07"), Date.parse("2026-11-07"));
  for (const value of [null, undefined, {}, 1, "not-a-date"]) {
    assert.equal(parseIsoTimestampMs(value), undefined);
  }
});
