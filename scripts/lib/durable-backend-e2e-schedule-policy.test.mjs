import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const ts = createRequire(import.meta.url)("typescript");
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

const POLICY_MODULE = "./lib/durable-backend-e2e-schedule-policy";
const POLICY_FUNCTIONS = [
  "createDurableScanPolicyCadence", "durableDeliveryDigestScheduleWindow",
  "scheduledInterestIdempotencyKey", "bindingIdempotencyKey", "policyIdempotencyKey",
  "scanIdempotencyKey", "scheduledBindingIdempotencyKey", "scheduledPolicyIdempotencyKey",
];

function inspectSchedulePolicyWiring(source) {
  const tree = ts.createSourceFile("durable-backend-e2e-loop.ts", source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imported = new Set();
  const called = new Set();
  const declared = new Set();
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === POLICY_MODULE && statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const element of statement.importClause.namedBindings.elements) {
        if (!element.propertyName) imported.add(element.name.text);
      }
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) called.add(node.expression.text);
    if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { imported, called, declared };
}

test("runner delegates actual imported policy calls rather than comment or name markers", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  assert.match(source, /createDurableScanPolicyCadence\(\{ minimumScanIntervalSecondsForProvider \}\)/);
  const wiring = inspectSchedulePolicyWiring(source);
  for (const name of POLICY_FUNCTIONS) {
    assert.ok(wiring.imported.has(name), name + " must import the extracted policy owner");
    assert.ok(wiring.called.has(name), name + " must be a real AST call");
    assert.ok(!wiring.declared.has(name), name + " must not be redefined in the runner");
  }
  assert.ok(wiring.called.has("durableScanPolicyCadence"), "runner must invoke injected scan cadence");
});

test("commented-out call and wrong import owner cannot satisfy policy wiring", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const forgedCall = source.replace(
    "durableDeliveryDigestScheduleWindow({",
    "identity(/* durableDeliveryDigestScheduleWindow({ */ {",
  );
  assert.notEqual(forgedCall, source, "mutation must replace the real call");
  assert.ok(forgedCall.includes("durableDeliveryDigestScheduleWindow("),
    "legacy substring assertion would accept a comment-only call");
  assert.ok(!inspectSchedulePolicyWiring(forgedCall).called.has("durableDeliveryDigestScheduleWindow"),
    "real call must disappear despite its marker remaining in a comment");

  const wrongOwner = source.replace(
    'from "./lib/durable-backend-e2e-schedule-policy";',
    'from "./lib/unrelated-policy";',
  );
  assert.notEqual(wrongOwner, source, "mutation must replace the real owner");
  assert.ok(!inspectSchedulePolicyWiring(wrongOwner).imported.has("scheduledInterestIdempotencyKey"),
    "renamed import owner must not pass the structural assertion");
});
