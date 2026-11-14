import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, project: "tsconfig.build.json" });
const ts = require("typescript");
const {
  seedDurableIdentity, durableCounts,
  scheduledScanEvidenceSnapshot, autoSummaryEvidenceSnapshot,
} = require("./durable-backend-e2e-pg-evidence.ts");

const ids = { runId: "run-fixture", tenantId: "tenant-1", workspaceId: "workspace-1",
  userId: "user-1", membershipId: "membership-1" };
function fakePool(result = () => ({ rows: [] })) {
  const calls = [];
  let released = 0;
  const pool = { async connect() { return {
    async query(sql, params) { calls.push({ sql: sql.trim(), params }); return result(sql); },
    release() { released++; },
  }; } };
  return { pool, calls, get released() { return released; } };
}

function normalizedSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function assertSqlClauses(sql, clauses) {
  // SQL predicates in block/line comments must not satisfy executable contracts.
  const executableSql = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
  const actual = normalizedSql(executableSql);
  for (const clause of clauses) {
    assert.ok(actual.includes(normalizedSql(clause)), "missing SQL contract: " + clause);
  }
}

const scheduledSqlContract = [
  "array_agg(fi.id::text order by fi.observed_at desc)",
  "left join feed_items fi on fi.tenant_id = j.tenant_id and fi.workspace_id = j.workspace_id and fi.source_binding_id = j.source_binding_id",
  "where j.tenant_id = $1 and j.workspace_id = $2 and j.source_binding_id = $3 and j.scan_policy_id = $4",
  "and j.idempotency_key like 'scheduled:%'",
  "order by j.created_at desc limit 1",
];
const autoSummarySqlContract = [
  "where j.tenant_id = $1 and j.workspace_id = $2 and j.topic_id = $3",
  "and j.user_id is null and j.subscription_id is null and j.idempotency_key like 'auto-summary:%'",
  "order by j.requested_at desc, j.id desc limit 1",
  "on selected.tenant_id = previous.tenant_id and selected.workspace_id = previous.workspace_id and selected.topic_id = previous.topic_id",
  "and previous.requested_at < selected.requested_at",
  "on fi.tenant_id = selected.tenant_id and fi.workspace_id = selected.workspace_id and fi.topic_id = selected.topic_id and fi.status = 'VISIBLE'",
  "where fi.observed_at <= selected.requested_at and (previous.requested_at is null or fi.observed_at > previous.requested_at)",
];

test("identity seed preserves SQL order, transaction, bindings and release", async () => {
  const db = fakePool();
  await seedDurableIdentity(db.pool, ids);
  assert.equal(db.calls[0].sql, "begin");
  for (const [i, name] of ["tenants", "workspaces", "users", "memberships"].entries()) {
    assert.match(db.calls[i + 1].sql, new RegExp("insert into " + name));
  }
  assert.equal(db.calls[5].sql, "commit");
  assert.deepEqual(db.calls[1].params, [ids.tenantId, "tenant-" + ids.runId,
    "Durable Backend Loop Tenant"]);
  assert.deepEqual(db.calls[4].params, [ids.membershipId, ids.tenantId,
    ids.workspaceId, ids.userId]);
  assert.equal(db.released, 1);
});

test("identity seed rolls back on failure and rethrows without masking", async () => {
  const db = fakePool(sql => {
    if (sql.includes("insert into workspaces")) throw new Error("fixture failure");
    return { rows: [] };
  });
  await assert.rejects(seedDurableIdentity(db.pool, ids), /fixture failure/);
  assert.equal(db.calls.at(-1).sql, "rollback");
  assert.equal(db.released, 1);
});

test("counts retain tenant/workspace-scoped query, numbers and missing-row error", async () => {
  const db = fakePool(() => ({ rows: [{
    topics: "1", scan_jobs: 2, feed_items: "3", summary_jobs: 4,
    summaries: "5", feedback: 6, digests: 7, delivery_attempts: 8,
  }] }));
  assert.deepEqual(await durableCounts(db.pool, ids.tenantId, ids.workspaceId), {
    topics: 1, scanJobs: 2, feedItems: 3, summaryJobs: 4,
    summaries: 5, feedback: 6, digests: 7, deliveryAttempts: 8,
  });
  assert.deepEqual(db.calls[0].params, [ids.tenantId, ids.workspaceId]);
  assert.match(db.calls[0].sql, /where tenant_id = \$1 and workspace_id = \$2/);
  assertSqlClauses(db.calls[0].sql, [
    "topics", "scan_jobs", "feed_items", "summary_jobs",
    "summary_artifacts", "summary_feedback", "digests", "delivery_attempts",
  ].map(table => `from ${table} where tenant_id = $1 and workspace_id = $2`));
  assert.equal(db.released, 1);
  const missing = fakePool();
  await assert.rejects(durableCounts(missing.pool, ids.tenantId, ids.workspaceId),
    /durable count query returned no row/);
  assert.equal(missing.released, 1);
});

test("scheduled scan snapshot preserves scoped bindings, date mapping and nullable IDs", async () => {
  const date = new Date("2026-11-14T04:00:00Z");
  const db = fakePool(() => ({ rows: [{
    scan_job_id: "scan-1", status: "SUCCEEDED", scheduled_idempotency_key: "scheduled:1",
    completed_at: date, failure_reason: null, next_run_at_after_schedule: date,
    feed_item_count: "3", feed_item_ids: null,
  }] }));
  const args = { tenantId: ids.tenantId, workspaceId: ids.workspaceId,
    sourceBindingId: "binding-1", scanPolicyId: "policy-1" };
  assert.deepEqual(await scheduledScanEvidenceSnapshot(db.pool, args), {
    scanJobId: "scan-1", status: "SUCCEEDED", scheduledIdempotencyKey: "scheduled:1",
    completedAt: date.toISOString(), failureReason: null,
    nextRunAtAfterSchedule: date.toISOString(), feedItemCount: 3, feedItemIds: [],
  });
  assert.deepEqual(db.calls[0].params,
    [ids.tenantId, ids.workspaceId, "binding-1", "policy-1"]);
  assert.match(db.calls[0].sql, /j\.idempotency_key like 'scheduled:%'/);
  assertSqlClauses(db.calls[0].sql, scheduledSqlContract);
  assert.equal(db.released, 1);
});

test("auto summary snapshot keeps scoped SQL, timestamp and empty-value fallbacks", async () => {
  const date = new Date("2026-11-14T04:00:00Z");
  const db = fakePool(() => ({ rows: [{
    summary_job_id: "job-1", summary_id: null, idempotency_key: "auto-summary:1",
    status: "no_signal", requested_at: date, completed_at: null,
    failure_reason: null, latest_feed_item_observed_at: null, new_feed_item_count: "4",
  }] }));
  const args = { tenantId: ids.tenantId, workspaceId: ids.workspaceId, interestId: "topic-1" };
  assert.deepEqual(await autoSummaryEvidenceSnapshot(db.pool, args), {
    summaryJobId: "job-1", summaryId: "", idempotencyKey: "auto-summary:1",
    status: "no_signal", requestedAt: date.toISOString(), completedAt: "",
    failureReason: null, latestFeedItemObservedAt: "", newFeedItemCount: 4,
  });
  assert.deepEqual(db.calls[0].params, [ids.tenantId, ids.workspaceId, "topic-1"]);
  assert.match(db.calls[0].sql, /j\.idempotency_key like 'auto-summary:%'/);
  assert.match(db.calls[0].sql, /and j\.user_id is null/);
  assert.match(db.calls[0].sql, /and j\.subscription_id is null/);
  assertSqlClauses(db.calls[0].sql, autoSummarySqlContract);
  assert.equal(db.released, 1);
  const absent = fakePool();
  assert.equal(await autoSummaryEvidenceSnapshot(absent.pool, args), undefined);
  assert.equal(absent.released, 1);
});

test("missing scheduled scan row returns undefined and always releases client", async () => {
  const db = fakePool();
  assert.equal(await scheduledScanEvidenceSnapshot(db.pool, {
    tenantId: ids.tenantId, workspaceId: ids.workspaceId,
    sourceBindingId: "binding-1", scanPolicyId: "policy-1",
  }), undefined);
  assert.equal(db.released, 1);
});


test("SQL contracts reject missing cross-tenant filters, visibility and latest-row ordering", async () => {
  const scheduled = fakePool();
  await scheduledScanEvidenceSnapshot(scheduled.pool, {
    tenantId: ids.tenantId, workspaceId: ids.workspaceId,
    sourceBindingId: "binding-1", scanPolicyId: "policy-1",
  });
  const auto = fakePool();
  await autoSummaryEvidenceSnapshot(auto.pool, {
    tenantId: ids.tenantId, workspaceId: ids.workspaceId, interestId: "topic-1",
  });
  for (const [sql, clauses, removed] of [
    [scheduled.calls[0].sql, scheduledSqlContract, "and fi.workspace_id = j.workspace_id"],
    [scheduled.calls[0].sql, scheduledSqlContract, "order by j.created_at desc"],
    [auto.calls[0].sql, autoSummarySqlContract, "and j.workspace_id = $2"],
    [auto.calls[0].sql, autoSummarySqlContract, "and fi.status = 'VISIBLE'"],
    [auto.calls[0].sql, autoSummarySqlContract, "order by j.requested_at desc, j.id desc"],
  ]) {
    const changed = sql.replace(removed, "/* mutation: removed */");
    assert.notEqual(changed, sql, "mutation must remove a real clause: " + removed);
    assert.throws(() => assertSqlClauses(changed, clauses),
      /missing SQL contract/, "missing contract did not fail: " + removed);
    const commented = sql.replace(removed, `/* ${removed} */`);
    assert.notEqual(commented, sql, "comment guard must target a real clause: " + removed);
    assert.throws(() => assertSqlClauses(commented, clauses),
      /missing SQL contract/, "SQL comment bypass escaped detection: " + removed);
  }
  assert.equal(scheduled.released, 1);
  assert.equal(auto.released, 1);
});

test("orchestrator delegates through real TS imports/calls without duplicate SQL helpers", () => {
  const source = readFileSync("scripts/capture-durable-backend-e2e-loop.ts", "utf8");
  const tree = ts.createSourceFile("durable-backend-e2e-loop.ts", source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = ["seedDurableIdentity", "durableCounts",
    "scheduledScanEvidenceSnapshot", "autoSummaryEvidenceSnapshot"];
  const imported = new Set(), called = new Set();
  for (const statement of tree.statements) {
    if (ts.isFunctionDeclaration(statement) &&
      [...names, "withClient"].includes(statement.name?.text)) {
      assert.fail("duplicate SQL helper in runner: " + statement.name.text);
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "./lib/durable-backend-e2e-pg-evidence" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const element of statement.importClause.namedBindings.elements) {
        if (element.propertyName === undefined) imported.add(element.name.text);
      }
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      called.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const name of names) {
    assert.ok(imported.has(name), "missing imported helper: " + name);
    assert.ok(called.has(name), "missing real invocation: " + name);
  }

  for (const [owner, helper] of [
    ["pollScheduledScanEvidence", "scheduledScanEvidenceSnapshot"],
    ["pollAutoSummaryEvidence", "autoSummaryEvidenceSnapshot"],
  ]) {
    const declaration = tree.statements.find(node =>
      ts.isFunctionDeclaration(node) && node.name?.text === owner);
    assert.ok(declaration?.body, "missing poll owner: " + owner);
    let delegated = false;
    function check(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === helper && node.arguments.length === 2 &&
        ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === "pool" &&
        ts.isIdentifier(node.arguments[1]) && node.arguments[1].text === "params") {
        delegated = true;
      }
      ts.forEachChild(node, check);
    }
    check(declaration.body);
    assert.ok(delegated, "missing direct " + helper + "(pool, params) in " + owner);
  }
});
