import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createDurableBackendEvidencePollers } from "./durable-backend-e2e-evidence-pollers.ts";

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
    ...scheduledParams, scanJobId: "scan-1", scheduledIdempotencyKey: "scheduled-1",
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

test("runner invokes extracted pollers with original live DB snapshots and parser helpers", () => {
  const source = readFileSync("scripts/capture-durable-backend-e2e-loop.ts", "utf8");
  assert.match(source, /createDurableBackendEvidencePollers\(\{\s*pool, scheduledScanEvidenceSnapshot, autoSummaryEvidenceSnapshot, readString, readNumber, readStringArray, delay,/);
  assert.match(source, /pollScheduledScanEvidence\(/);
  assert.match(source, /pollAutoSummaryEvidence\(/);
  assert.doesNotMatch(source, /^async function pollScheduledScanEvidence\(/m);
});
