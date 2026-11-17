import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createDurableScanPolicyCadence, durableDeliveryDigestScheduleWindow,
  scheduledInterestIdempotencyKey, bindingIdempotencyKey, policyIdempotencyKey,
  scanIdempotencyKey, scheduledBindingIdempotencyKey, scheduledPolicyIdempotencyKey,
} from "./durable-backend-e2e-schedule-policy.ts";

test("provider cadence uses live provider minimum and original 300 second freshness floor", () => {
  let interval = 60;
  const calls = [];
  const { durableScanPolicyCadence } = createDurableScanPolicyCadence({
    minimumScanIntervalSecondsForProvider(provider) {
      calls.push(provider);
      return interval;
    },
  });
  assert.deepEqual(durableScanPolicyCadence("rss"), { intervalSeconds: 60, freshnessSeconds: 300 });
  interval = 600;
  assert.deepEqual(durableScanPolicyCadence("reddit"), { intervalSeconds: 600, freshnessSeconds: 600 });
  assert.deepEqual(calls, ["rss", "reddit"]);
});

test("digest scheduling preserves first-run delay, padding, floor and ceiling", () => {
  const start = new Date("2026-11-17T00:00:00.000Z");
  const atStart = durableDeliveryDigestScheduleWindow({ loopStartedAt: start, scheduledAt: start });
  assert.equal(atStart.nextRunAt.getTime() - start.getTime(), 3000);
  assert.equal(atStart.intervalSeconds, 60);
  const later = durableDeliveryDigestScheduleWindow({
    loopStartedAt: start, scheduledAt: new Date(start.getTime() + 100001),
  });
  assert.equal(later.nextRunAt.getTime() - start.getTime(), 103001);
  assert.equal(later.intervalSeconds, 134);
  assert.equal(durableDeliveryDigestScheduleWindow({
    loopStartedAt: new Date(start.getTime() + 500000), scheduledAt: start,
  }).intervalSeconds, 60);
});

test("idempotency strings remain byte-for-byte compatible for every key family", () => {
  const runId = "run:with/slash";
  assert.equal(scheduledInterestIdempotencyKey(runId), "scheduled-topic-" + runId);
  assert.equal(bindingIdempotencyKey("rss", runId), "binding-rss-" + runId);
  assert.equal(policyIdempotencyKey("reddit", runId), "policy-reddit-" + runId);
  assert.equal(scanIdempotencyKey("hacker-news", runId), "scan-hacker-news-" + runId);
  assert.equal(scheduledBindingIdempotencyKey(runId), "scheduled-binding-rss-" + runId);
  assert.equal(scheduledPolicyIdempotencyKey(runId), "scheduled-policy-rss-" + runId);
});

test("runner delegates all key families and scan cadence to extracted policy", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  assert.match(source, /createDurableScanPolicyCadence\(\{ minimumScanIntervalSecondsForProvider \}\)/);
  for (const name of ["durableDeliveryDigestScheduleWindow", "scheduledInterestIdempotencyKey",
    "bindingIdempotencyKey", "policyIdempotencyKey", "scanIdempotencyKey",
    "scheduledBindingIdempotencyKey", "scheduledPolicyIdempotencyKey"]) {
    assert.ok(source.includes(name + "("), name);
    assert.ok(!source.includes("function " + name + "("), name + " must have one owner");
  }
});
