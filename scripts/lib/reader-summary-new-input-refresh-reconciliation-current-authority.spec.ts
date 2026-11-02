import { approvedGatewayLlmSdkIdentity } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";
import { FakeReconciliationDatabase } from "./reader-summary-new-input-refresh-reconciliation.spec-support";
import { chmodSync, linkSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertRefreshReconciliationEvidence, refreshReconciliationAccountingFor, reconcileConsumedRefreshJob } from "./reader-summary-new-input-refresh-reconciliation";
import { currentAuthorityFixture } from "./reader-summary-new-input-refresh-reconciliation-current-authority.spec-support";
import { refreshBytesHash, refreshHash, refreshOperation, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

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

const gatewayRoutes: NonNullable<RefreshManifest["gateway"]>[] = [
  { profileId: "TEST-codex", modelBackend: "openai-chatgpt", model: "gpt-6.1-sol",
    reasoningEffort: "low", minOutputTokens: 16_384 },
  { profileId: "TEST-kimi", modelBackend: "kimi-code", model: "k3-256k", minOutputTokens: 32_768 },
  { profileId: "TEST-openrouter", modelBackend: "openrouter", model: "openai/gpt-oss-120b",
    reasoningEffort: "medium", minOutputTokens: 32_768 },
];
function gatewayManifest(route = gatewayRoutes[0]!): RefreshManifest {
  const value: RefreshManifest = { ...refreshManifest(), format: "reader-summary-seven-day-new-input-v2",
    gateway: route, model: route.model, reasoningEffort: route.reasoningEffort ?? "default",
    runtime: { engine: "gateway-llm", packageVersion: approvedGatewayLlmSdkIdentity.packageVersion,
      launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256 } };
  return { ...value, operation: refreshOperation(value) };
}
// Rebind reviewed attempt hashes so policy rejection cannot be attributed to
// stale hashes after changing the journal's model/effort pair.
function rebindAttempts(evidence: ReturnType<typeof fixture>["evidence"]) {
  const rows = readFileSync(evidence.invocation.journalPath, "utf8").trimEnd().split("\n")
    .map((line) => JSON.parse(line) as { event: { requestId?: string } });
  return { ...evidence, invocation: { ...evidence.invocation,
    attempts: evidence.invocation.attempts.map((attempt) => ({ ...attempt,
      attemptSha256: refreshHash(rows.find((row) => row.event.requestId === attempt.requestId)),
    })) } };
}
it.each(gatewayRoutes)("reconciles the immutable v2 $model route with zero paid effects and exact replay", async (route) => {
  const { evidence } = fixture(undefined, gatewayManifest(route));
  expect(() => verify(evidence)).not.toThrow();
  const database = new FakeReconciliationDatabase([{ id: evidence.jobId, operation: evidence.operation,
    status: "FAILED", artifactId: null, date: evidence.date, sha: "f".repeat(64), publications: 0 }]);
  const input = { client: database.client, evidence, evidenceSha256: refreshHash(evidence),
    now: new Date("2026-09-07T12:00:00.000Z"), ids: { generate: () => "00000000-0000-4000-8000-00000000000a" } };
  const receipt = await reconcileConsumedRefreshJob(input);
  expect(receipt).toMatchObject({ status: "reconciled", operation: evidence.operation,
    accounting: { providerInvocations: 0, providerUsage: "none", summaryGenerations: 0, publications: 0, artifacts: 0 } });
  expect(await reconcileConsumedRefreshJob(input)).toMatchObject({ status: "already_reconciled" });
  expect(database.reconciliations).toHaveLength(1);
  expect(database.counters).toHaveLength(0);
  database.assertJobsUntouched();
});
it.each([
  { model: "gpt-5.6-sol", reasoningEffort: "low" },
  { model: "gpt-6.1-sol", reasoningEffort: "high" },
])("rejects fully rehashed v2 journal pair $model/$reasoningEffort", async (pair) => {
  const { evidence } = fixture((rows) => {
    rows.filter((row) => row.event.status === "requires_reconciliation")
      .forEach((row) => Object.assign(row.event, pair));
  }, gatewayManifest());
  const reviewed = rebindAttempts(evidence), query = jest.fn();
  expect(() => verify(reviewed)).toThrow();
  await expect(reconcileConsumedRefreshJob({ client: { $queryRaw: query }, evidence: reviewed,
    evidenceSha256: refreshHash(reviewed), now: new Date("2026-09-07T12:00:00.000Z"),
    ids: { generate: () => "00000000-0000-4000-8000-00000000000a" } })).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
it.each(["missing-route", "null-route", "primitive-route", "wrong-model", "wrong-effort", "wrong-sdk", "v1-extra-gateway"])(
  "rejects immutable, rehashed %s manifest before trusting its event identity", (kind) => {
    const value = kind === "v1-extra-gateway" ? refreshManifest() : gatewayManifest();
    if (kind === "missing-route") delete (value as { gateway?: unknown }).gateway;
    if (kind === "null-route") Object.assign(value, { gateway: null });
    if (kind === "primitive-route") Object.assign(value, { gateway: "gateway-llm" });
    if (kind === "wrong-model") Object.assign(value, { model: "gpt-5.6-sol" });
    if (kind === "wrong-effort") Object.assign(value, { reasoningEffort: "high" });
    if (kind === "wrong-sdk") Object.assign(value, { runtime: { ...value.runtime, launcherSha256: "e".repeat(64) } });
    if (kind === "v1-extra-gateway") Object.assign(value, { gateway: gatewayRoutes[0] });
    const manifest = { ...value, operation: refreshOperation(value) };
    const { evidence } = fixture(undefined, manifest);
    expect(() => verify(evidence)).toThrow();
  });
