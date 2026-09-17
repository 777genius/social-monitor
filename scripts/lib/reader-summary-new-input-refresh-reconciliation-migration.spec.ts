import type * as PGliteModule from "@electric-sql/pglite";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { currentAuthorityFixture } from "./reader-summary-new-input-refresh-reconciliation-current-authority.spec-support";
import { preProviderFixture } from "./reader-summary-new-input-refresh-reconciliation-pre-provider.spec-support";
import { reconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation.spec-support";
import { refreshReconciliationAccountingFor } from "./reader-summary-new-input-refresh-reconciliation";

const migration = (name: string) => readFileSync(join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8");
describe("pre-provider reconciliation migration constraints", () => {
  let db: PGliteModule.PGlite;
  const fixture = preProviderFixture();
  const authorityFixture = currentAuthorityFixture();
  const authority = authorityFixture.evidence;
  const pre = fixture.evidence, provider = reconciliationEvidence();
  const reported = { ...provider, invocation: { ...provider.invocation, providerUsageReported: true,
    usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } } };
  let existingRows: unknown[];
  const insert = (reason: string, invocation: unknown, accounting: unknown) => db.query(`
    insert into reader_summary_new_input_refresh_reconciliations
      (job_status, reason, operation, period_started_at, period_ended_at,
       job_sha256, manifest_sha256, evidence_sha256, invocation, accounting)
    values ('FAILED', $1, 'new-input-refresh:v1:synthetic', '2026-08-31', '2026-09-01',
      $2, $2, $2, $3::jsonb, $4::jsonb)`,
  [reason, "a".repeat(64), JSON.stringify(invocation), JSON.stringify(accounting)]);
  beforeAll(async () => {
    const { PGlite } = process.getBuiltinModule("module").createRequire(__filename)("@electric-sql/pglite") as typeof PGliteModule;
    db = new PGlite();
    await db.exec(`create role social_monitor_public_schema_owner;
      grant all on schema public to social_monitor_public_schema_owner;
      set role social_monitor_public_schema_owner;
      create table reader_summary_new_input_refresh_reconciliations (
        job_status text not null, reason text not null, operation text not null,
        period_started_at timestamptz not null, period_ended_at timestamptz not null,
        job_sha256 text not null, manifest_sha256 text not null, evidence_sha256 text not null,
        invocation jsonb not null, accounting jsonb not null,
        constraint rs_nir_reconciliations_identity_check check (reason = 'consumed_provider_invocation_without_summary'),
        constraint rs_nir_reconciliations_accounting_check check (true)); reset role;`);
    await db.exec(migration("20260911015000_reader_summary_reconciliation_reported_usage"));
    await insert(provider.reason, provider.invocation, refreshReconciliationAccountingFor(provider));
    await expect(insert(pre.reason, pre.invocation, refreshReconciliationAccountingFor(pre))).rejects.toThrow();
    await db.exec(migration("20260913060000_reader_summary_reconciliation_pre_provider"));
    await insert(pre.reason, pre.invocation, refreshReconciliationAccountingFor(pre));
    await insert(reported.reason, reported.invocation, refreshReconciliationAccountingFor(reported));
    existingRows = (await db.query("select * from reader_summary_new_input_refresh_reconciliations")).rows;
    await expect(insert(authority.reason, authority.invocation, refreshReconciliationAccountingFor(authority)))
      .rejects.toMatchObject({ code: "23514", constraint: "rs_nir_reconciliations_accounting_check" });
    await db.exec(migration("20260913100000_reader_summary_reconciliation_current_authority"));
  }, 30_000);
  afterAll(async () => { await db?.close(); rmSync(fixture.root, { recursive: true, force: true });
    rmSync(authorityFixture.root, { recursive: true, force: true }); });

  it("retains existing rows and permits both honest accounting variants", async () => {
    expect((await db.query("select * from reader_summary_new_input_refresh_reconciliations")).rows).toEqual(existingRows);
    await insert(authority.reason, authority.invocation, refreshReconciliationAccountingFor(authority));
    await insert(pre.reason, pre.invocation, refreshReconciliationAccountingFor(pre));
    await insert(provider.reason, provider.invocation, refreshReconciliationAccountingFor(provider));
    const reported = { ...provider, invocation: { ...provider.invocation, providerUsageReported: true,
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } } };
    await insert(reported.reason, reported.invocation, refreshReconciliationAccountingFor(reported));
  });
  it.each([
    ...Object.keys(authority.invocation).map((key) => ({ [key]: undefined })),
    ...Object.keys(authority.invocation).map((key) => ({ [key]: null })),
    { evidenceKind: "paired_capture" }, { evidenceKind: 1 },
    { journalPath: 7 }, { journalPath: "relative" }, { manifestPath: false },
    { journalSha256: "invalid" }, { journalSha256: 1 },
    { invocationConsumedCount: 1 }, { invocationConsumedCount: "0" },
    { delegatedInvocationCount: 1 }, { delegatedInvocationCount: "0" },
    { providerUsageReported: true }, { providerUsageReported: "false" },
    { attempts: [] }, { attempts: {} }, { attempts: "attempt" },
    { capturePath: "/synthetic" }, { captureSha256: "a".repeat(64) },
    { usage: {} }, { requestId: "provider" },
  ])("rejects malformed current-authority invocation %j", async (override) => {
    await expect(insert(authority.reason, { ...authority.invocation, ...override },
      refreshReconciliationAccountingFor(authority))).rejects.toMatchObject({ code: "23514" });
  });
  it.each([
    { providerInvocations: 1 }, { providerInvocations: "0" },
    { providerUsage: "unknown" }, { providerUsage: "reported" }, { usage: {} },
    { summaryGenerations: 1 }, { publications: 1 }, { artifacts: 1 },
    { providerUsage: null }, { providerUsage: undefined },
  ])("rejects malformed current-authority accounting %j", async (override) => {
    await expect(insert(authority.reason, authority.invocation,
      { ...refreshReconciliationAccountingFor(authority), ...override }))
      .rejects.toMatchObject({ code: "23514" });
  });
  it("rejects provider/current-authority cross-family combinations", async () => {
    for (const [reason, invocation, accounting] of [
      [provider.reason, authority.invocation, refreshReconciliationAccountingFor(provider)],
      [provider.reason, authority.invocation, refreshReconciliationAccountingFor(authority)],
      [authority.reason, provider.invocation, refreshReconciliationAccountingFor(authority)],
      [authority.reason, authority.invocation, refreshReconciliationAccountingFor(provider)],
      [authority.reason, authority.invocation, refreshReconciliationAccountingFor(reported)],
    ] as const) {
      await expect(insert(reason, invocation, accounting)).rejects.toMatchObject({ code: "23514" });
    }
    await expect(insert(reported.reason, reported.invocation, {
      ...refreshReconciliationAccountingFor(reported),
      usage: { inputTokens: 1, outputTokens: 4, totalTokens: 5 },
    })).rejects.toMatchObject({ code: "23514" });
    await expect(insert(provider.reason, {
      ...provider.invocation, evidenceKind: "journal_current_authority",
      invocationConsumedCount: 0, delegatedInvocationCount: 0, attempts: [{}],
    }, refreshReconciliationAccountingFor(provider))).rejects.toMatchObject({ code: "23514" });
    await expect(insert(reported.reason, reported.invocation, {
      ...refreshReconciliationAccountingFor(reported), usage: undefined,
    })).rejects.toMatchObject({ code: "23514" });
    await expect(insert(provider.reason, provider.invocation, {
      ...refreshReconciliationAccountingFor(provider), providerUsage: null,
    })).rejects.toMatchObject({ code: "23514" });
  });
  it.each([
    { consumedAt: "2026-09-07T00:00:00.000Z" }, { usage: {} },
    { providerUsageReported: true }, { delegatedInvocationCount: 1 },
    { invocationConsumedCount: 1 }, { attempts: [] }, { attempts: null },
    { captureSha256: null }, { capturePath: 7 },
  ])("rejects mixed or incomplete zero-provider invocation %j", async (override) => {
    await expect(insert(pre.reason, { ...pre.invocation, ...override },
      refreshReconciliationAccountingFor(pre))).rejects.toThrow();
  });
  it("rejects crossed reasons/accounting and fabricated usage", async () => {
    await expect(insert(pre.reason, pre.invocation, refreshReconciliationAccountingFor(provider))).rejects.toThrow();
    await expect(insert(provider.reason, provider.invocation, refreshReconciliationAccountingFor(pre))).rejects.toThrow();
    await expect(insert(pre.reason, provider.invocation, refreshReconciliationAccountingFor(pre))).rejects.toThrow();
    await expect(insert(pre.reason, pre.invocation, { ...refreshReconciliationAccountingFor(pre), usage: {} })).rejects.toThrow();
    await expect(insert(provider.reason, { ...provider.invocation, providerUsageReported: true,
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 6 } },
    { ...refreshReconciliationAccountingFor(provider), providerUsage: "reported",
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 6 } })).rejects.toThrow();
  });
});
