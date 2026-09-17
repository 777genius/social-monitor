import { chmodSync, linkSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertRefreshReconciliationEvidence, refreshReconciliationAccountingFor } from "./reader-summary-new-input-refresh-reconciliation";
import { currentAuthorityFixture } from "./reader-summary-new-input-refresh-reconciliation-current-authority.spec-support";
import { refreshBytesHash, refreshHash } from "./reader-summary-new-input-refresh-manifest";

const roots: string[] = [];
const fixture = (...args: Parameters<typeof currentAuthorityFixture>) => {
  const test = currentAuthorityFixture(...args); roots.push(test.root); return test;
};
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const verify = (e: ReturnType<typeof fixture>["evidence"]) => assertRefreshReconciliationEvidence(e, [e.date]);

it("binds all six exact journal failures without a capture and reports zero provider usage", () => {
  const { evidence } = fixture();
  expect(() => verify(evidence)).not.toThrow();
  expect(refreshReconciliationAccountingFor(evidence)).toEqual({ summaryGenerations: 0, publications: 0,
    artifacts: 0, providerInvocations: 0, providerUsage: "none" });
});
it.each(["invocation_consumed", "invocation_returned", "verified_attestation", "completed", "unknown"])(
  "rejects additional %s evidence", (status) => {
    const { evidence } = fixture((rows) => { rows.splice(5, 0, { ...rows[4]!, event: { ...rows[4]!.event, status } }); });
    expect(() => verify(evidence)).toThrow();
  });
it.each(["local", "runtime_health", "runtime_mismatch", "assessment_budget", "request_admission", "journal_consumption", "unknown"])(
  "rejects a rehashed failure at %s", (stage) => {
    const { evidence } = fixture((rows) => { rows[4]!.event.preDelegationFailureStage = stage; });
    const row = JSON.parse(readFileSync(evidence.invocation.journalPath, "utf8").split("\n")[4]!);
    const attempts = evidence.invocation.attempts.map((a, i) => i === 0 ? { ...a, attemptSha256: refreshHash(row) } : a);
    expect(() => verify({ ...evidence, invocation: { ...evidence.invocation, attempts } })).toThrow();
  });
it.each(["delegated", "tokens", "usage", "attestation", "extra"])("rejects conflicting %s fields", (key) => {
  const { evidence } = fixture((rows) => { rows[4]!.event[key] = key === "delegated" ? true : {}; });
  expect(() => verify(evidence)).toThrow();
});
it.each(["missing", "duplicate", "wrong-job", "wrong-operation", "wrong-manifest", "malformed-time", "missing-stage"])(
  "rejects %s journal events", (kind) => {
    const { evidence } = fixture((rows) => {
      if (kind === "missing") rows.splice(4, 1);
      if (kind === "duplicate") rows[5] = rows[4]!;
      if (kind === "wrong-job") rows[3]!.event.jobId = "wrong";
      if (kind === "wrong-operation") rows[4]!.event.operation = "wrong";
      if (kind === "wrong-manifest") rows.at(-1)!.event.manifestSha256 = "0".repeat(64);
      if (kind === "malformed-time") rows[4]!.at = "yesterday";
      if (kind === "missing-stage") delete rows[4]!.event.preDelegationFailureStage;
    });
    expect(() => verify(evidence)).toThrow();
  });
it.each(["manifestPath", "journalPath"] as const)("rejects mutable, linked or hash-mismatched %s", (key) => {
  const { root, evidence } = fixture();
  const path = evidence.invocation[key];
  chmodSync(path, 0o600); expect(() => verify(evidence)).toThrow(); chmodSync(path, 0o400);
  const hard = join(root, "hard"); linkSync(path, hard); expect(() => verify(evidence)).toThrow(); rmSync(hard);
  const sym = join(root, "sym"); symlinkSync(path, sym);
  expect(() => verify({ ...evidence, invocation: { ...evidence.invocation, [key]: sym } })).toThrow();
  chmodSync(path, 0o600); writeFileSync(path, "{}\n"); chmodSync(path, 0o400);
  expect(() => verify(evidence)).toThrow();
});
it("rejects truncated JSONL even when its hash is reviewed", () => {
  const { evidence } = fixture(), path = evidence.invocation.journalPath;
  const bytes = Buffer.from(readFileSync(path, "utf8").trimEnd());
  chmodSync(path, 0o600); writeFileSync(path, bytes); chmodSync(path, 0o400);
  expect(() => verify({ ...evidence, invocation: { ...evidence.invocation,
    journalSha256: refreshBytesHash(bytes) } })).toThrow();
});
it.each(["missing", "extra", "duplicate", "hash", "time", "usage"])("rejects %s reviewed attempts", (kind) => {
  const { evidence } = fixture();
  const attempts = [...evidence.invocation.attempts];
  if (kind === "missing") attempts.pop();
  if (kind === "extra") attempts.push({ ...attempts[0]!, requestId: "extra" });
  if (kind === "duplicate") attempts[1] = attempts[0]!;
  if (kind === "hash") attempts[0] = { ...attempts[0]!, attemptSha256: "0".repeat(64) };
  if (kind === "time") attempts[0] = { ...attempts[0]!, failedAt: "2026-09-05T23:00:00.000Z" };
  if (kind === "usage") Object.assign(attempts[0]!, { usage: { totalTokens: 0 } });
  expect(() => verify({ ...evidence, invocation: { ...evidence.invocation, attempts } })).toThrow();
});
it("rejects nested provider evidence and malformed lifecycle counts", () => {
  for (const countsBefore of [{ jobs: -1, publications: 1, outbox: 1, artifacts: 1 },
    { jobs: 1, publications: 1, outbox: 1, artifacts: 1, nested: { usage: {} } }]) {
    const { evidence } = fixture((rows) => { rows[0]!.event.countsBefore = countsBefore; });
    expect(() => verify(evidence)).toThrow();
  }
});
