import { refreshScope } from "./reader-summary-new-input-refresh-manifest";
import { assertRefreshReconciliationEvidence, reconcileConsumedRefreshJob,
  refreshReconciliationAccounting } from "./reader-summary-new-input-refresh-reconciliation";
import { assertRefreshReconciliationCountersEvidence, importRefreshReconciliationCounters } from
  "./reader-summary-new-input-refresh-reconciliation-counters";
import { FakeReconciliationDatabase, reconciliationDate, reconciliationEvidence,
  reconciliationJobId, reconciliationOperation, type FakeJobRow } from
  "./reader-summary-new-input-refresh-reconciliation.spec-support";

const dates = [reconciliationDate];
const now = new Date("2026-09-07T12:00:00.000Z");
const ids = { generate: () => "00000000-0000-4000-8000-00000000000a" };
const consumed: FakeJobRow = { id: reconciliationJobId, operation: reconciliationOperation,
  status: "FAILED", artifactId: null, date: reconciliationDate, sha: "f".repeat(64), publications: 0 };
const evidenceSha256 = "9".repeat(64);
const apply = (database: FakeReconciliationDatabase, override = {}, sha = evidenceSha256) =>
  reconcileConsumedRefreshJob({ client: database.client, evidence: reconciliationEvidence(override),
    evidenceSha256: sha, now, ids });

describe("new-input refresh consumed-job reconciliation", () => {
  it("records the consumed attempt as accounted for, never as completed", async () => {
    const database = new FakeReconciliationDatabase([{ ...consumed }]);
    const receipt = await apply(database);
    expect(receipt).toMatchObject({ status: "reconciled", jobId: reconciliationJobId,
      operation: reconciliationOperation, jobSha256: consumed.sha });
    expect(receipt.accounting).toEqual(refreshReconciliationAccounting);
    expect(receipt.accounting.providerUsage).toBe("unknown");
    expect(receipt.accounting.summaryGenerations).toBe(0);
    expect(database.reconciliations).toHaveLength(1);
    expect(database.reconciliations[0]).toMatchObject({ jobStatus: "FAILED" });
    database.assertJobsUntouched();
  });

  it("accounts for a completed provider response with exact reported usage", async () => {
    const database = new FakeReconciliationDatabase([{ ...consumed }]);
    const usage = { inputTokens: 90_824, outputTokens: 6_325, totalTokens: 97_149 };
    const receipt = await apply(database, { invocation: {
      ...reconciliationEvidence().invocation, providerUsageReported: true, usage } });
    expect(receipt.accounting).toEqual(expect.objectContaining({ providerUsage: "reported", usage }));
    database.assertJobsUntouched();
  });

  it("is idempotent: an exact replay returns the committed record and adds nothing", async () => {
    const database = new FakeReconciliationDatabase([{ ...consumed }]);
    const first = await apply(database);
    const second = await apply(database);
    const third = await apply(database);
    expect(first.status).toBe("reconciled");
    expect(second.status).toBe("already_reconciled");
    expect(third.status).toBe("already_reconciled");
    expect({ ...second, status: first.status }).toEqual(first);
    expect(database.reconciliations).toHaveLength(1);
    database.assertJobsUntouched();
  });

  it.each([
    ["manifest", { manifestSha256: "4".repeat(64) }],
    ["invocation", { invocation: { ...reconciliationEvidence().invocation, requestSha256: "2".repeat(64) } }],
  ])("refuses a conflicting %s for an already reconciled job", async (_label, override) => {
    const database = new FakeReconciliationDatabase([{ ...consumed }]);
    await apply(database);
    await expect(apply(database, override)).rejects.toThrow(/conflicts with the committed record/u);
    expect(database.reconciliations).toHaveLength(1);
    database.assertJobsUntouched();
  });

  it("refuses a different reviewed evidence document for the same job", async () => {
    const database = new FakeReconciliationDatabase([{ ...consumed }]);
    await apply(database);
    await expect(apply(database, {}, "8".repeat(64)))
      .rejects.toThrow(/conflicts with the committed record/u);
    expect(database.reconciliations).toHaveLength(1);
  });

  it.each([
    ["a completed job", { status: "COMPLETED" }],
    ["a job that adopted an artifact", { artifactId: "artifact" }],
    ["a job that already published", { publications: 1 }],
    ["a job of another date", { date: "2026-09-04" }],
  ])("refuses to reconcile %s", async (_label, override) => {
    const database = new FakeReconciliationDatabase([{ ...consumed, ...override }]);
    await expect(apply(database)).rejects.toThrow(/not a consumed unpublished failure|does not exist/u);
    expect(database.reconciliations).toEqual([]);
    database.assertJobsUntouched();
  });

  it("refuses a job that does not exist in this workspace", async () => {
    const database = new FakeReconciliationDatabase([]);
    await expect(apply(database)).rejects.toThrow(/does not exist in this workspace/u);
  });

  it.each([
    ["a foreign tenant", { tenantId: "00000000-0000-7000-8000-000000009999" }],
    ["an unreviewed date", { date: "2026-09-09" }],
    ["a non-refresh operation", { operation: "durable-reader-summary-daily:abc" }],
    ["a reported-usage invocation", { invocation: {
      ...reconciliationEvidence().invocation, providerUsageReported: true as never } }],
    ["a fabricated success reason", { reason: "completed" as never }],
  ])("rejects evidence with %s before any database work", (_label, override) => {
    expect(() => assertRefreshReconciliationEvidence(reconciliationEvidence(override), dates))
      .toThrow(/identity is invalid/u);
  });
});

const countersEvidence = (override = {}) => ({
  format: "reader-summary-new-input-refresh-reconciliation-counters-v1" as const,
  ...refreshScope, date: reconciliationDate,
  reconciliationId: ids.generate(), jobId: reconciliationJobId,
  requestId: reconciliationEvidence().invocation.requestId,
  attemptSha256: reconciliationEvidence().invocation.attemptSha256,
  counters: { inputTokens: 12_000, outputTokens: 3_000, totalTokens: 15_000 },
  provenance: "independently_verified_provider_statement" as const,
  verifiedBy: "provider-billing-export", verifiedAt: "2026-09-07T11:00:00.000Z",
  ...override,
});
const importCounters = (database: FakeReconciliationDatabase, override = {}, sha = "a".repeat(64)) =>
  importRefreshReconciliationCounters({ client: database.client, evidence: countersEvidence(override),
    evidenceSha256: sha, now, ids: { generate: () => "00000000-0000-4000-8000-00000000000b" } });

describe("new-input refresh supplemental provider counters", () => {
  const reconciled = async () => {
    const database = new FakeReconciliationDatabase([{ ...consumed }]);
    await apply(database);
    return database;
  };

  it("imports verified counters against the original request without changing accounting", async () => {
    const database = await reconciled();
    const receipt = await importCounters(database);
    expect(receipt.status).toBe("imported");
    expect(database.counters).toHaveLength(1);
    expect(database.reconciliations[0]?.accounting).toEqual(refreshReconciliationAccounting);
    database.assertJobsUntouched();
  });

  it("is idempotent for an exact re-import and refuses a divergent one", async () => {
    const database = await reconciled();
    const first = await importCounters(database);
    const replay = await importCounters(database);
    expect(replay).toEqual({ ...first, status: "already_imported" });
    await expect(importCounters(database, { counters: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
      .rejects.toThrow(/conflict with the committed evidence/u);
    expect(database.counters).toHaveLength(1);
  });

  it.each([
    ["another provider request", { requestId: "some-other-request" }],
    ["another attempt result", { attemptSha256: "5".repeat(64) }],
    ["another reconciliation", { reconciliationId: "00000000-0000-4000-8000-0000000000ff" }],
  ])("refuses counters bound to %s", async (_label, override) => {
    const database = await reconciled();
    await expect(importCounters(database, override))
      .rejects.toThrow(/do not reference the recorded original result/u);
    expect(database.counters).toEqual([]);
  });

  it.each([
    ["inconsistent totals", { counters: { inputTokens: 1, outputTokens: 1, totalTokens: 3 } }],
    ["negative counters", { counters: { inputTokens: -1, outputTokens: 1, totalTokens: 0 } }],
    ["partial counters", { counters: { inputTokens: 1, outputTokens: 1 } as never }],
  ])("rejects %s before any database work", (_label, override) => {
    expect(() => assertRefreshReconciliationCountersEvidence(countersEvidence(override), dates))
      .toThrow(/not a complete verified statement/u);
  });

  it("rejects counters that do not claim independent verification", () => {
    expect(() => assertRefreshReconciliationCountersEvidence(
      countersEvidence({ provenance: "self_reported" as never }), dates)).toThrow(/identity is invalid/u);
  });
});
