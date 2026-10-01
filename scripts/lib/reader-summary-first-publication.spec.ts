import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { DatasetGuardedReaderSummaryEvidenceSelector } from "./reader-summary-day-dataset-guard";
import { FirstPublicationOperation, resolveFirstPublicationMode, readFirstPublicationOperation } from "./reader-summary-first-publication";
import { parseFirstPublicationInventory, firstPublicationBytesSha256 } from "./reader-summary-first-publication-inventory";
import { firstpubFixture, firstpubScope, firstpubStart, firstpubEnd, firstpubAsOf } from "./reader-summary-first-publication.spec-support";

function job(key: string) { return ReaderSummaryJob.request({ id: "synthetic-job", tenantId: tenantId(firstpubScope.tenantId),
  workspaceId: workspaceId(firstpubScope.workspaceId), scope: { type: "workspace" },
  period: buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC", startedAt: firstpubStart, endedAt: firstpubEnd }),
  requestedAt: firstpubAsOf, idempotencyKey: key }).toSnapshot(); }

it("keeps all 422 rows including 24 late observations at the same as-of across advancing clocks and locked publication", async () => {
  const s = await firstpubFixture(); const op = s.operation();
  await op.reserve();
  const boundary = await op.claim(job(op.idempotencyKey));
  expect(boundary.observedThrough).toEqual(firstpubAsOf);
  s.advance(3600_000);
  let selectedAt: Date | undefined;
  const selector = new DatasetGuardedReaderSummaryEvidenceSelector({ select: async (params) => {
    selectedAt = params.observedThrough;
    s.advance(3600_000); return { selectedEvidence: [] } as never;
  } }, op.guard);
  await selector.select({ observedThrough: boundary.observedThrough } as never);
  await s.db.client.$transaction(async (tx) => op.guard.assertCurrentForPublicationTransaction(tx), { isolationLevel: "Serializable" });
  expect(selectedAt).toEqual(firstpubAsOf);
  expect(op.evidence()).toMatchObject({ providerCoverage: "UNPROVEN", dataset: { feedRowCount: 422,
    completedPhases: ["before_evidence_selection", "after_evidence_selection", "before_publication"] } });
  expect(s.db.reads.filter((r) => r.sql.includes("with inventory as")).flatMap((r) => r.values)
    .filter((v): v is Date => v instanceof Date).every((v) => v.getTime() <= firstpubAsOf.getTime())).toBe(true);
  expect(s.db.locks).toBeGreaterThanOrEqual(3);
});

it.each((["jobs", "artifacts", "publications", "slots", "dailyModelJobs"] as const)
  .flatMap((category) => (["failed", "unknown"] as const).map((status) => [category, status] as const)))(
  "refuses any pre-existing %s claim including %s", async (category, status) => {
    const s = await firstpubFixture(); s.db.existingClaims.push({ category, status });
    await expect(s.operation().reserve()).rejects.toThrow("already claimed");
    expect(s.db.claims.slots).toBe(0);
    expect(s.db.existingClaims).toEqual([{ category, status }]);
  });

it("two simultaneous independent manifest requests commit one reservation and invoke one provider", async () => {
  const s = await firstpubFixture();
  const one = s.operation();
  const two = new FirstPublicationOperation({ ...s.input, manifestSha256: "f".repeat(64) }, s.inventory);
  let providerCalls = 0;
  const execute = async (op: FirstPublicationOperation) => { await op.reserve(); await op.claim(job(op.idempotencyKey)); providerCalls++; };
  const results = await Promise.allSettled([execute(one), execute(two)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(providerCalls).toBe(1); expect(s.db.claims.slots).toBe(1);
});

it.each(["before_provider", "provider_error"])("retains durable reservation after %s and refuses a new process/manifest", async (failure) => {
  const s = await firstpubFixture(); const op = s.operation(); await op.reserve();
  if (failure === "provider_error") await op.claim(job(op.idempotencyKey));
  const restarted = new FirstPublicationOperation({ ...s.input, manifestSha256: "e".repeat(64) }, s.inventory);
  await expect(restarted.reserve()).rejects.toThrow("already claimed");
  expect(s.db.claims.slots).toBe(1);
});

it.each(["missing_join", "missing_observation", "future", "late_after_asof", "before_day", "scope_deleted", "binding_deleted", "content_changed"])("fails closed before reservation on %s", async (change) => {
  const s = await firstpubFixture(); const op = s.operation(); const row = s.db.rows[0]!;
  if (change === "missing_join") row.validJoin = false;
  if (change === "missing_observation") row.sourceObservedAt = NaN;
  if (change === "late_after_asof") row.observedAt = firstpubAsOf.getTime() + 1;
  if (change === "future") row.sourceObservedAt = firstpubAsOf.getTime() + 1;
  if (change === "before_day") row.observedAt = firstpubStart.getTime() - 1;
  if (change === "scope_deleted") s.db.scopeDeleted = true;
  if (change === "binding_deleted") row.deleted = true;
  if (change === "content_changed") row.version++;
  await expect(op.reserve()).rejects.toThrow(); expect(s.db.claims.slots).toBe(0);
});

it("fails changed scope after selection and inside the publication transaction", async () => {
  const s = await firstpubFixture(); const op = s.operation(); await op.reserve();
  await op.guard.assertCurrent("before_evidence_selection");
  s.db.scopeDeleted = true;
  await expect(op.guard.assertCurrent("after_evidence_selection")).rejects.toThrow();
  s.db.scopeDeleted = false;
  await op.guard.assertCurrent("after_evidence_selection");
  s.db.rows[421]!.observedAt = firstpubAsOf.getTime() + 1;
  await expect(s.db.client.$transaction((tx) => op.guard.assertCurrentForPublicationTransaction(tx),
    { isolationLevel: "Serializable" })).rejects.toThrow();
  expect(s.db.claims.slots).toBe(1);
});

it("rejects manifest precision, future/stale as-of, mismatched day/tenant/workspace and wrong hash shape", async () => {
  const s = await firstpubFixture();
  for (const delta of [1, -1800_002]) {
    expect(() => new FirstPublicationOperation(s.input, { ...s.inventory, datasetManifest: {
      ...s.inventory.datasetManifest, generatedAt: new Date(s.clock.now().getTime() + delta).toISOString() } })).toThrow();
  }
  for (const input of [{ ...s.input, tenantId: "other" }, { ...s.input, workspaceId: "other" },
    { ...s.input, startedAt: firstpubEnd }, { ...s.input, manifestSha256: "invalid" }]) {
    expect(() => new FirstPublicationOperation(input, s.inventory)).toThrow();
  }
  expect(() => parseFirstPublicationInventory(Buffer.from(JSON.stringify({ ...s.inventory, datasetManifest: {
    ...s.inventory.datasetManifest, generatedAt: "2026-10-01T10:00:00.000001Z" } })))).toThrow("precision");
});

it("requires reservation and refuses repeat claims, wrong job day or live Date selection", async () => {
  const s = await firstpubFixture(); const op = s.operation(); const props = job(op.idempotencyKey);
  await expect(op.claim(props)).rejects.toThrow(); await op.reserve();
  await expect(op.claim({ ...props, period: { ...props.period, startedAt: firstpubEnd } })).rejects.toThrow();
  await op.claim(props); await expect(op.claim(props)).rejects.toThrow();
  const selector = new DatasetGuardedReaderSummaryEvidenceSelector({ select: async () => { throw new Error("forbidden selection"); } }, op.guard);
  await expect(selector.select({ observedThrough: firstpubEnd } as never)).rejects.toThrow("as-of");
});

it("operator route is explicit Sep29 MiMo and refuses live/recovery/replay contamination", () => {
  const input = { argv: ["--historical-first-publication"], environment: {
    DURABLE_READER_SUMMARY_MODEL: "agent-runtime", DURABLE_READER_SUMMARY_TOPIC_LABELER: "agent-runtime",
    AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan" }, cadence: "daily", timezone: "UTC",
    startedAt: firstpubStart, endedAt: firstpubEnd, now: firstpubAsOf, replayActive: false, recoveryActive: false };
  expect(resolveFirstPublicationMode(input)).toBe(true);
  expect(resolveFirstPublicationMode({ ...input, argv: [] })).toBe(false);
  for (const change of [{ replayActive: true }, { recoveryActive: true }, { startedAt: firstpubEnd },
    { environment: { ...input.environment, DURABLE_READER_SUMMARY_LIVE_OBSERVATION_CUTOFF: firstpubAsOf.toISOString() } }]) {
    expect(() => resolveFirstPublicationMode({ ...input, ...change })).toThrow();
  }
});

it("hash-pins a private immutable manifest and rejects replacement before effects", async () => {
  const s = await firstpubFixture();
  const privateRoot = mkdtempSync(join(process.cwd(), ".firstpub-synthetic-"));
  const manifestPath = join(privateRoot, "inventory.json");
  try {
    writeFileSync(manifestPath, JSON.stringify(s.inventory), { mode: 0o400 });
    const input = { ...s.input, privateRoot, manifestPath, forbiddenOutputPaths: [] };
    expect(() => readFirstPublicationOperation({ ...input, manifestSha256: "0".repeat(64) })).toThrow("hash");
    const op = readFirstPublicationOperation(input);
    chmodSync(manifestPath, 0o600);
    const replacement = JSON.stringify({ ...s.inventory, operatorNotes: "changed pinned input" });
    writeFileSync(manifestPath, replacement);
    input.manifestSha256 = firstPublicationBytesSha256(Buffer.from(replacement)); // Caller mutation cannot repin the operation.
    chmodSync(manifestPath, 0o400);
    await expect(op.reserve()).rejects.toThrow("changed");
    expect(s.db.claims.slots).toBe(0);
  } finally { rmSync(privateRoot, { recursive: true, force: true }); }
});

it("cannot lower the expected 422-row count or change a declared sub-digest to admit 398", async () => {
  const s = await firstpubFixture();
  for (const dataset of [{ ...s.inventory.datasetManifest.dataset, feedRowCount: 398 },
    { ...s.inventory.datasetManifest.dataset, feedRowsSha256: "f".repeat(64) }]) {
    expect(() => new FirstPublicationOperation(s.input, { ...s.inventory,
      datasetManifest: { ...s.inventory.datasetManifest, dataset } })).toThrow("inconsistent");
  }
});
