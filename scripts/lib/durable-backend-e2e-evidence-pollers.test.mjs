import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createDurableBackendEvidencePollers } from "./durable-backend-e2e-evidence-pollers.ts";

const ts = createRequire(import.meta.url)("typescript");

const scheduledParams = {
  tenantId: "tenant", workspaceId: "workspace", providerKey: "rss",
  sourceBindingId: "binding", scanPolicyId: "policy",
};
const summaryParams = {
  tenantId: "tenant", workspaceId: "workspace", interestId: "interest",
  summaryPolicyId: "summary-policy",
};
const scheduledSuccess = {
  status: "SUCCEEDED", scanJobId: "scan-1", scheduledIdempotencyKey: "scheduled-1",
  completedAt: "2026-11-17T00:00:00Z", nextRunAtAfterSchedule: "2026-11-17T00:01:00Z",
  feedItemCount: 2, feedItemIds: ["feed-1", "feed-2"],
};
const summarySuccess = {
  status: "completed", summaryJobId: "summary-job", summaryId: "summary-id",
  idempotencyKey: "summary-key", requestedAt: "request", completedAt: "complete",
  latestFeedItemObservedAt: "observed", newFeedItemCount: 2,
};

function harness({ scans = [], summaries = [] } = {}) {
  const pool = {};
  const called = { scan: [], summary: [], delays: [] };
  let scanIndex = 0;
  let summaryIndex = 0;
  const pollers = createDurableBackendEvidencePollers({
    pool,
    scheduledScanEvidenceSnapshot(db, params) {
      assert.equal(db, pool);
      called.scan.push(params);
      return Promise.resolve(scans[scanIndex++]);
    },
    autoSummaryEvidenceSnapshot(db, params) {
      assert.equal(db, pool);
      called.summary.push(params);
      return Promise.resolve(summaries[summaryIndex++]);
    },
    readString(value, name) {
      return typeof value[name] === "string" ? value[name] : "";
    },
    readNumber(value, name) {
      return typeof value[name] === "number" ? value[name] : 0;
    },
    readStringArray(value, name) {
      return Array.isArray(value[name]) ? value[name] : [];
    },
    async delay(ms) { called.delays.push(ms); },
  });
  return { ...pollers, called };
}

test("scheduled scan retries pending snapshots, preserves success evidence and DB scope", async () => {
  const f = harness({ scans: [undefined, scheduledSuccess] });
  const value = await f.pollScheduledScanEvidence(scheduledParams, { timeoutMs: 5000, label: "scheduled" });
  assert.deepEqual(value, {
    providerKey: "rss", sourceBindingId: "binding", scanPolicyId: "policy",
    scanJobId: "scan-1", scheduledIdempotencyKey: "scheduled-1",
    status: "SUCCEEDED", completedAt: scheduledSuccess.completedAt,
    nextRunAtAfterSchedule: scheduledSuccess.nextRunAtAfterSchedule,
    feedItemCount: 2, feedItemIds: ["feed-1", "feed-2"],
    // tenant and workspace identify the query, not the returned evidence.
  });
  assert.deepEqual(f.called.scan, [scheduledParams, scheduledParams]);
  assert.deepEqual(f.called.delays, [1000]);
});

test("scheduled scan remains fail-closed for FAILED and CANCELLED, including reason", async () => {
  for (const status of ["FAILED", "CANCELLED"]) {
    const f = harness({ scans: [{ status, failureReason: "native failure" }] });
    await assert.rejects(f.pollScheduledScanEvidence(scheduledParams, { timeoutMs: 5000, label: "scheduled" }),
      new RegExp("scheduled ended with " + status + ": native failure"));
    assert.deepEqual(f.called.delays, []);
  }
});

test("scheduled success with no feed items cannot be accepted", async () => {
  const f = harness({ scans: [{ ...scheduledSuccess, feedItemCount: 0 }, scheduledSuccess] });
  assert.equal((await f.pollScheduledScanEvidence(scheduledParams, { timeoutMs: 5000, label: "scheduled" })).feedItemCount, 2);
  assert.deepEqual(f.called.delays, [1000]);
});

test("auto-summary keeps completed/no_signal statuses and nonempty summaryId gate", async () => {
  for (const status of ["completed", "no_signal"]) {
    const f = harness({ summaries: [{ ...summarySuccess, status, summaryId: "" }, { ...summarySuccess, status }] });
    const value = await f.pollAutoSummaryEvidence(summaryParams, { timeoutMs: 5000, label: "auto" });
    assert.deepEqual(value, { summaryPolicyId: "summary-policy", summaryJobId: "summary-job",
      summaryId: "summary-id", idempotencyKey: "summary-key", status,
      requestedAt: "request", completedAt: "complete",
      latestFeedItemObservedAt: "observed", newFeedItemCount: 2 });
    assert.deepEqual(f.called.summary, [summaryParams, summaryParams]);
    assert.deepEqual(f.called.delays, [1000]);
  }
});

test("auto-summary remains fail-closed for failed and rejected jobs", async () => {
  for (const status of ["failed", "rejected"]) {
    const f = harness({ summaries: [{ status, failureReason: "blocked" }] });
    await assert.rejects(f.pollAutoSummaryEvidence(summaryParams, { timeoutMs: 5000, label: "auto" }),
      new RegExp("auto ended with " + status + ": blocked"));
  }
});

test("both pollers preserve immediate timeout diagnostics without fabricating evidence", async () => {
  const f = harness();
  await assert.rejects(f.pollScheduledScanEvidence(scheduledParams, { timeoutMs: -1, label: "scheduled" }),
    /scheduled did not complete before timeout; last=\{\}/);
  await assert.rejects(f.pollAutoSummaryEvidence(summaryParams, { timeoutMs: -1, label: "auto" }),
    /auto did not complete before timeout; last=\{\}/);
  assert.deepEqual(f.called.scan, []);
  assert.deepEqual(f.called.summary, []);
});

const POLLER_MODULE = "./lib/durable-backend-e2e-evidence-pollers";
const POLLER_NAMES = ["pollScheduledScanEvidence", "pollAutoSummaryEvidence"];
const POLLER_DEPS = [
  "pool", "scheduledScanEvidenceSnapshot", "autoSummaryEvidenceSnapshot",
  "readString", "readNumber", "readStringArray", "delay",
];

function inspectPollerWiring(source) {
  const tree = ts.createSourceFile("capture-durable-backend-e2e-loop.ts", source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const moduleDeclarations = new Set(tree.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations]));
  const imported = new Set();
  const called = new Set();
  const declared = new Set();
  let factoryDeps;
  let boundPollers;
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === POLLER_MODULE &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const element of statement.importClause.namedBindings.elements) {
        if (!element.propertyName) imported.add(element.name.text);
      }
    }
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      called.add(node.expression.text);
    }
    // Require the live module-level binding; a factory in a dead nested function
    // cannot supply the actual top-level polling consumers.
    if (ts.isVariableDeclaration(node) && moduleDeclarations.has(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer && ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "createDurableBackendEvidencePollers" &&
      node.initializer.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.initializer.arguments[0])) {
      factoryDeps = new Set(node.initializer.arguments[0].properties
        .filter(ts.isShorthandPropertyAssignment).map(property => property.name.text));
      boundPollers = new Set(node.name.elements.map(element => element.name.getText(tree)));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { imported, called, declared, factoryDeps, boundPollers };
}

test("runner delegates real imported pollers and passes live DB snapshots and parsers", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const wiring = inspectPollerWiring(source);
  assert.ok(wiring.imported.has("createDurableBackendEvidencePollers"),
    "runner must import the extracted owner");
  assert.ok(wiring.called.has("createDurableBackendEvidencePollers"),
    "runner must actually call the poller factory");
  for (const dependency of POLLER_DEPS) {
    assert.ok(wiring.factoryDeps?.has(dependency), dependency + " must be passed by live shorthand");
  }
  for (const name of POLLER_NAMES) {
    assert.ok(wiring.boundPollers?.has(name), name + " must be bound from the factory");
    assert.ok(wiring.called.has(name), name + " must have a real call");
    assert.ok(!wiring.declared.has(name), name + " must not duplicate the extracted owner");
  }
});

test("comment-only factory call and wrong import owner fail structural inspection", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const commented = source.replace(
    "createDurableBackendEvidencePollers({",
    "identity(/* createDurableBackendEvidencePollers({ */ {",
  );
  assert.notEqual(commented, source, "mutation must target the real factory");
  assert.ok(commented.includes("createDurableBackendEvidencePollers("),
    "old substring guard would incorrectly accept the comment");
  assert.ok(!inspectPollerWiring(commented).called.has("createDurableBackendEvidencePollers"),
    "commented-out factory must not satisfy an actual AST call");

  const wrongOwner = source.replace(
    'from "./lib/durable-backend-e2e-evidence-pollers";',
    'from "./lib/unrelated-poller";',
  );
  assert.notEqual(wrongOwner, source, "mutation must target the real import");
  assert.ok(!inspectPollerWiring(wrongOwner).imported.has("createDurableBackendEvidencePollers"),
    "wrong import source must not satisfy the extracted-owner contract");
});

test("dead nested poller factory cannot satisfy module-level binding or dependencies", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const originalFactory = [
    "const { pollScheduledScanEvidence, pollAutoSummaryEvidence } = createDurableBackendEvidencePollers({",
    "  pool, scheduledScanEvidenceSnapshot, autoSummaryEvidenceSnapshot, readString, readNumber, readStringArray, delay,",
    "});",
  ].join("\n");
  const deadFactory = source.replace(originalFactory,
    "function neverInvokedEvidenceFactory() {\n" + originalFactory + "\n}");
  assert.notEqual(deadFactory, source, "mutation must relocate the real factory declaration");
  const mutated = inspectPollerWiring(deadFactory);
  assert.ok(mutated.called.has("createDurableBackendEvidencePollers"),
    "dead factory still contains a real AST call");
  assert.ok(mutated.called.has("pollScheduledScanEvidence"),
    "top-level downstream call remains, but its binding is now undefined");
  assert.equal(mutated.boundPollers, undefined, "dead nested binding must not count");
  assert.equal(mutated.factoryDeps, undefined, "dead nested dependencies must not count");
});
