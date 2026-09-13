import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertRefreshReconciliationEvidence, reconcileConsumedRefreshJob, refreshReconciliationAccountingFor,
  type RefreshReconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation";
import { FakeReconciliationDatabase, reconciliationDate, reconciliationEvidence, reconciliationJobId,
  reconciliationOperation } from "./reader-summary-new-input-refresh-reconciliation.spec-support";
import { preProviderFixture } from "./reader-summary-new-input-refresh-reconciliation-pre-provider.spec-support";
import { refreshBytesHash, refreshHash, refreshKeyPrefix } from "./reader-summary-new-input-refresh-manifest";

const roots: string[] = [];
const fixture = (change?: Parameters<typeof preProviderFixture>[0]) => {
  const value = preProviderFixture(change); roots.push(value.root); return value.evidence;
};
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const validate = (evidence: RefreshReconciliationEvidence) =>
  assertRefreshReconciliationEvidence(evidence, [reconciliationDate]);

it("accepts the original journal hash when JSON drops providerInstanceId: undefined", () => {
  const e = fixture();
  const { event: { command } } = JSON.parse(readFileSync(join(e.invocation.capturePath, "models.jsonl"),
    "utf8").split("\n")[0]!);
  expect(command).not.toHaveProperty("providerInstanceId");
  expect(e.invocation.attempts[0]!.requestSha256).not.toBe(refreshHash(command));
  expect(e.invocation.attempts[0]!.requestSha256).toBe(refreshHash({ ...command, providerInstanceId: undefined }));
  expect(() => validate(e)).not.toThrow();
});

it.each(["absent", "present"])("accepts an exact %s provider instance command hash", (shape) => {
  const value = preProviderFixture(undefined, (command) => {
    if (shape === "absent") delete command.providerInstanceId;
    else command.providerInstanceId = "synthetic-instance";
  });
  roots.push(value.root);
  expect(() => validate(value.evidence)).not.toThrow();
});

it("does not reconstruct other undefined command properties", () => {
  const value = preProviderFixture(undefined, (command) => { command.cwd = undefined; });
  roots.push(value.root);
  expect(() => validate(value.evidence)).toThrow(/integrity is invalid/);
});

it("still requires evidence to match the exact historical journal hash", () => {
  const e = fixture(({ models, journal }) => {
    const { command } = models[0]!.event as { command: Record<string, unknown> };
    (journal[1]!.event as Record<string, unknown>).requestSha256 =
      refreshHash(JSON.parse(JSON.stringify(command)));
  });
  expect(() => validate(e)).toThrow(/integrity is invalid/);
});

it.each([null, "synthetic-other-instance"])("rejects changed captured providerInstanceId %j", (providerInstanceId) => {
  const e = fixture(({ models }) => {
    const event = models[0]!.event as { command: Record<string, unknown> };
    event.command.providerInstanceId = providerInstanceId;
  });
  expect(() => validate(e)).toThrow(/integrity is invalid/);
});

it.each(["2026-02-29", "2026-04-31", "2026-9-01"])(
  "rejects pre-provider noncanonical date %s before opening evidence artifacts", (date) => {
    const evidence = { ...fixture(), date, operation: refreshKeyPrefix(date) + "a".repeat(64) };
    expect(() => assertRefreshReconciliationEvidence(evidence, [date])).toThrow(
      "Refresh reconciliation evidence identity is invalid");
  });

it("binds all six failed requests to the exact reviewed manifest, capture and consumed job", async () => {
  const evidence = fixture();
  expect(() => validate(evidence)).not.toThrow();
  const accounting = { summaryGenerations: 0, publications: 0, artifacts: 0,
    providerInvocations: 0, providerUsage: "none" };
  expect(refreshReconciliationAccountingFor(evidence)).toEqual(accounting);
  const db = new FakeReconciliationDatabase([{ id: reconciliationJobId, operation: reconciliationOperation,
    status: "FAILED", artifactId: null, date: reconciliationDate, sha: "f".repeat(64), publications: 0 }]);
  const input = { client: db.client, evidence, evidenceSha256: "a".repeat(64),
    now: new Date("2026-09-07T01:00:00.000Z"), ids: { generate: () => "00000000-0000-4000-8000-000000000001" } };
  expect(await reconcileConsumedRefreshJob(input)).toMatchObject({ status: "reconciled", accounting });
  expect(await reconcileConsumedRefreshJob(input)).toMatchObject({ status: "already_reconciled", accounting });
  db.assertJobsUntouched();
});

it.each([
  { consumedAt: "2026-09-07T00:00:01.000Z" }, { returnedAt: "2026-09-07T00:00:02.000Z" },
  { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }, { providerUsageReported: true },
  { delegatedInvocationCount: 1 }, { invocationConsumedCount: 1 }, { attempts: [] },
  { captureSha256: "bad" },
])("rejects mixed or false pre-provider shape %j", (override) => {
  const e = fixture();
  expect(() => validate({ ...e, invocation: { ...e.invocation, ...override } } as RefreshReconciliationEvidence)).toThrow();
});

it("preserves provider-consumed validation and rejects mixing capture claims into it", () => {
  const e = reconciliationEvidence();
  expect(() => validate(e)).not.toThrow();
  expect(refreshReconciliationAccountingFor(e).providerInvocations).toBe(1);
  expect(() => validate({ ...e, invocation: { ...e.invocation, captureSha256: "a".repeat(64) } } as
    RefreshReconciliationEvidence)).toThrow();
});

it.each(["attemptSha256", "requestSha256", "startedAt", "failedAt", "delegated"])(
  "rejects a changed attempt %s", (field) => {
    const e = fixture();
    const attempts = e.invocation.attempts.map((attempt, i) => i ? attempt : { ...attempt, [field]: "wrong" });
    expect(() => validate({ ...e, invocation: { ...e.invocation, attempts } } as RefreshReconciliationEvidence)).toThrow();
  });

it.each(["invocation_returned", "envelope_verified", "envelope_not_consumed", "invocation_aborted"])(
  "rejects a rehashed capture with %s", (kind) => {
    const e = fixture(({ models }) => models.push({ sequence: 13, atMs: 1788739202500,
      event: { kind, requestId: "synthetic-0" } }));
    expect(() => validate(e)).toThrow();
  });

it("rejects a delegated failure even when the capture digest was reviewed", () => {
  const e = fixture(({ models }) => { (models[6]!.event as Record<string, unknown>).delegated = true; });
  expect(() => validate(e)).toThrow();
});

it("rejects a missing failed pair", () => {
  const e = fixture(({ models }) => { models.pop(); });
  expect(() => validate(e)).toThrow();
});

it("rejects current-operation consumption hidden among other journal operations", () => {
  const e = fixture(({ journal }) => journal.push({ at: "2026-09-07T00:00:01.000Z",
    event: { status: "invocation_consumed", operation: reconciliationOperation, requestId: "synthetic-0" } }));
  expect(() => validate(e)).toThrow();
});

it.each(["jobId", "operation"])("rejects a false consumed job %s", (field) => {
  const e = fixture(({ journal }) => { (journal[0]!.event as Record<string, unknown>)[field] = "wrong"; });
  expect(() => validate(e)).toThrow();
});

it("rejects duplicate attempts", () => {
  const e = fixture();
  expect(() => validate({ ...e, invocation: { ...e.invocation,
    attempts: [...e.invocation.attempts, e.invocation.attempts[0]!] } })).toThrow();
});

it.each(["models.jsonl", "controls.json", "incomplete.json"])("rejects changed capture bytes in %s", (name) => {
  const e = fixture(), path = join(e.invocation.capturePath, name);
  chmodSync(path, 0o600); writeFileSync(path, "{}\n"); chmodSync(path, 0o400);
  expect(() => validate(e)).toThrow();
});

it("rejects extra unlisted capture files and writable journals", () => {
  const e = fixture();
  writeFileSync(join(e.invocation.capturePath, "late.jsonl"), "{}\n");
  expect(() => validate(e)).toThrow();
  rmSync(join(e.invocation.capturePath, "late.jsonl"));
  chmodSync(e.invocation.journalPath, 0o600);
  expect(() => validate(e)).toThrow();
});

it.each(["journalPath", "manifestPath"] as const)("rejects changed reviewed bytes at %s", (key) => {
  const e = fixture(), path = e.invocation[key];
  chmodSync(path, 0o600); writeFileSync(path, "{}\n"); chmodSync(path, 0o400);
  expect(() => validate(e)).toThrow();
});

it("rejects an invocation that claims a different operation for a captured request", () => {
  const e = fixture(({ journal }) => journal.push({ at: "2026-09-07T00:00:01.000Z",
    event: { status: "invocation_consumed", operation: "different-operation", requestId: "synthetic-0" } }));
  expect(() => validate(e)).toThrow();
});

const historicalRequestId = "reader-summary-story-relations:00000000-0000-7000-8000-000000006101:" +
  "00000000-0000-7000-8000-000000006102:workspace:2026-09-11T13:38:37.654Z";
const historicalAttestation = { attestation: { requestId: historicalRequestId } };

it.each([undefined, historicalRequestId])(
  "accepts unrelated canonical nested attestation with top-level ID %j", (requestId) => {
    const e = fixture(({ journal }) => journal.unshift({ at: "2026-09-06T23:00:00.000Z",
      event: { status: "verified_attestation", requestId, attestation: historicalAttestation } }));
    expect(e.invocation.attempts).toHaveLength(6);
    expect(() => validate(e)).not.toThrow();
    expect(refreshReconciliationAccountingFor(e).providerInvocations).toBe(0);
  });

it.each([
  undefined, null, [], {}, { requestId: historicalRequestId }, { attestation: null },
  { attestation: [] }, { attestation: {} }, { attestation: { requestId: "" } },
  { attestation: { requestId: "  " } }, { attestation: { requestId: 123 } },
  { attestation: { attestation: { requestId: historicalRequestId } } },
])("rejects malformed canonical attestation identity %j", (attestation) => {
  for (const requestId of [undefined, historicalRequestId]) {
    const e = fixture(({ journal }) => journal.push({ event: {
      status: "verified_attestation", requestId, attestation } }));
    expect(() => validate(e)).toThrow(/integrity is invalid/);
  }
});

it.each(["synthetic-0", "different-historical", "", null, 123])(
  "rejects top-level/nested attestation disagreement %j", (requestId) => {
    const e = fixture(({ journal }) => journal.push({ event: {
      status: "verified_attestation", requestId, attestation: historicalAttestation } }));
    expect(() => validate(e)).toThrow(/integrity is invalid/);
  });

it.each([undefined, "different-operation", reconciliationOperation])(
  "rejects nested started request identity under operation %j", (operation) => {
    for (let index = 0; index < 6; index++) {
      const e = fixture(({ journal }) => journal.push({ event: {
        status: "verified_attestation", operation,
        attestation: { attestation: { requestId: `synthetic-${index}` } } } }));
      expect(() => validate(e)).toThrow(/integrity is invalid/);
    }
  });

it.each([{ delegated: true }, { tokens: 0 }, { usage: {} }, { operation: reconciliationOperation }])(
  "rejects unrelated canonical attestation with provider evidence %j", (extra) => {
    const e = fixture(({ journal }) => journal.push({ at: "2026-09-07T00:00:01.000Z", event: {
      status: "verified_attestation", attestation: historicalAttestation, ...extra } }));
    expect(() => validate(e)).toThrow(/integrity is invalid/);
  });

it.each([
  { status: "invocation_consumed" }, { status: "invocation_returned" },
  { status: "verified_attestation", attestation: {} }, { delegated: true },
  { tokens: 0 }, { usage: {} },
])("rejects unscoped current-request provider evidence %j", (providerEvidence) => {
  for (let index = 0; index < 6; index++) {
    const e = fixture(({ journal }) => journal.push({ at: "2026-09-07T00:00:01.000Z",
      event: { ...providerEvidence, requestId: `synthetic-${index}` } }));
    expect(() => validate(e)).toThrow(/integrity is invalid/);
  }
});

it.each([
  { status: "invocation_consumed" }, { status: "invocation_returned" },
  { status: "verified_attestation", attestation: {} }, { delegated: true },
  { tokens: 0 }, { usage: {} },
])("rejects current-operation provider evidence with an unrelated request ID %j", (providerEvidence) => {
  const e = fixture(({ journal }) => journal.push({ at: "2026-09-07T00:00:01.000Z",
    event: { ...providerEvidence, operation: reconciliationOperation, requestId: "synthetic-historical" } }));
  expect(() => validate(e)).toThrow(/integrity is invalid/);
});

it.each([
  undefined, { status: "verified_attestation", requestId: undefined,
    attestation: { attestation: { requestId: "synthetic-rejected" } } },
  { status: "invocation_consumed" }, { status: "invocation_returned" },
  { status: "verified_attestation", attestation: {} }, { delegated: true },
  { tokens: 0 }, { usage: {} },
])("guards rejected captured request evidence %j", (providerEvidence) => {
  for (const operation of [undefined, "different-operation", reconciliationOperation]) {
    const e = fixture(({ models, journal }) => {
      const { command } = models[0]!.event as { command: Record<string, unknown> };
      models.push({ sequence: 13, atMs: 1788739202500, event: {
        kind: "invocation_rejected", delegated: false,
        command: { ...command, requestId: "synthetic-rejected" } } });
      journal.unshift({ at: "2026-09-06T23:00:00.000Z", event: {
        status: "verified_attestation", attestation: historicalAttestation } });
      if (providerEvidence) journal.push({ at: "2026-09-07T00:00:02.500Z", event: {
        operation, requestId: "synthetic-rejected", ...providerEvidence } });
    });
    const path = join(e.invocation.capturePath, "incomplete.json");
    const capture = JSON.parse(readFileSync(path, "utf8"));
    capture.observationCounts.modelRequests = 7;
    const bytes = Buffer.from(JSON.stringify(capture) + "\n");
    chmodSync(path, 0o600); writeFileSync(path, bytes); chmodSync(path, 0o400);
    Object.assign(e.invocation, { captureSha256: refreshBytesHash(bytes) });
    if (providerEvidence) expect(() => validate(e)).toThrow(/integrity is invalid/);
    else expect(() => validate(e)).not.toThrow();
  }
});

it("rejects unscoped provider evidence without a request ID", () => {
  const e = fixture(({ journal }) => journal.push({ at: "2026-09-07T00:00:01.000Z",
    event: { status: "verified_attestation", attestation: {} } }));
  expect(() => validate(e)).toThrow();
});

it.each(["2026-08-29", "2026-09-06"])("rejects valid calendar date %s outside canonical refreshDates before SQL", async (date) => {
  const client = { $queryRaw: jest.fn() };
  for (const original of [reconciliationEvidence(), fixture()]) {
    const evidence = { ...original, date, operation: refreshKeyPrefix(date) + "a".repeat(64) };
    await expect(reconcileConsumedRefreshJob({ client, evidence, evidenceSha256: "a".repeat(64),
      now: new Date("2026-09-07T01:00:00.000Z"), ids: { generate: () => "synthetic" } })).rejects.toThrow(
      "Refresh reconciliation evidence identity is invalid");
  }
  expect(client.$queryRaw).not.toHaveBeenCalled();
});
