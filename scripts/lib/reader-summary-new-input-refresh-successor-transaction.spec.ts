import { FixedClock } from "@social-monitor/shared-kernel";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { consumeRefreshSuccessor } from "./reader-summary-new-input-refresh-successor";
import { captureRefreshDatabaseAuthority } from "./reader-summary-new-input-refresh-capture";
import { readRefreshJobs, readRefreshPrior, readRefreshReconciliations } from "./reader-summary-new-input-refresh-postgres";
import { refreshReconciliationAccounting } from "./reader-summary-new-input-refresh-reconciliation";
import { refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { successorManifest, successorJob, successorEvidence } from "./reader-summary-new-input-refresh-successor.spec-support";
import type { RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

jest.mock("./reader-summary-new-input-refresh-capture", () => ({
  ...jest.requireActual("./reader-summary-new-input-refresh-capture"), captureRefreshDatabaseAuthority: jest.fn(),
}));
jest.mock("./reader-summary-new-input-refresh-postgres", () => ({
  ...jest.requireActual("./reader-summary-new-input-refresh-postgres"),
  readRefreshPrior: jest.fn(), readRefreshJobs: jest.fn(), readRefreshReconciliations: jest.fn(),
}));

function fixture() {
  const m = successorManifest();
  const { canonicalInputSha256, eligibleCount, ...authority } = m.authority;
  void canonicalInputSha256; void eligibleCount;
  const original = { jobId: m.successor!.originalJobId, operation: successorEvidence().operation,
    status: "FAILED", artifactId: null, jobSha256: "f".repeat(64) };
  const reconciled = [{ reconciliationId: m.successor!.reconciliationId, jobId: original.jobId,
    operation: original.operation, jobStatus: original.status, jobSha256: original.jobSha256 }];
  const jobs = [original];
  const active = new Set<number>(), shares = new Set<number>();
  const snapshots = new Map<PrismaReaderSummaryClient, typeof authority>();
  const order: string[] = [];
  let exclusive: number | undefined, sequence = 0, inserts = 0, transactions = 0;
  const state = { valid: true, lostHolder: false, busy: false, driftBeforeLock: false,
    lockResult: [{ locked: true }] as unknown, malformedCapability: "ledgers", capabilityFailure: "", database: authority, prior: m.prior };
  const summary: Pick<PrismaSummaryConnection, "$transaction"> = {
    $transaction: async (work, options) => {
      expect(options?.isolationLevel).toBe("Serializable");
      transactions++;
      const id = ++sequence;
      active.add(id);
      let pending: typeof original | undefined;
      const tx = {
        $executeRaw: async (strings: TemplateStringsArray) => {
          const sql = strings.join("");
          expect(sql).toMatch(/nowait/);
          if (state.busy) throw new Error("55P03 busy writer");
          if (sql.includes("reader_summary_jobs")) {
            expect(exclusive === undefined || exclusive === id).toBe(true);
            if (sql.includes("share row exclusive")) {
              if ([...shares].some((owner) => owner !== id)) throw new Error("55P03 concurrent grant");
              exclusive = id; order.push("upgrade");
            } else {
              expect(sql).toContain("public.reader_summary_artifacts");
              expect(sql).not.toMatch(/reader_summary_publications|reader_summary_publication_slots|reconciliations/);
              shares.add(id); order.push("share");
            }
          }
          if (sql.includes("source_item_engagement_snapshots")) order.push("authority");
          return 0;
        },
        $queryRaw: async (strings: TemplateStringsArray, ...values: readonly unknown[]) => {
          const sql = strings.join(" ? ");
          if (sql.includes("public.lock_reader_summary_refresh_")) {
            expect(values).toEqual([m.tenantId, m.workspaceId, m.date]);
            expect(shares.has(id)).toBe(true);
            const capability = sql.includes("publication_ledgers") ? "ledgers" : "reconciliation";
            order.push(capability);
            if (state.capabilityFailure === capability) throw new Error("55P03 capability conflict");
            return capability === state.malformedCapability ? state.lockResult : [{ locked: true }];
          }
          if (sql.includes("select exists(select 1 from pg_catalog.pg_locks")) {
            expect(shares.has(id)).toBe(true);
            return [{ held: active.has(values[0] as number) && !state.lostHolder }];
          }
          if (sql.includes("pg_catalog.pg_locks")) return [{ pid: id, vxid: `${id}/1` }];
          if (sql.includes("jsonb_build_object('format'")) {
            expect(exclusive).toBe(id); order.push("validate");
            return [{ evidence: successorEvidence(), accounting: refreshReconciliationAccounting, valid: state.valid }];
          }
          if (sql.includes("insert into reader_summary_jobs")) {
            expect(exclusive).toBe(id);
            expect(shares.size).toBe(1); // Holder is gone, admission owns locks.
            expect(sql).not.toMatch(/on conflict|\bupdate\b|\bdelete\b/i);
            expect(values).toContain(m.operation);
            if (jobs.some((job) => job.operation === m.operation)) throw new Error("23505 consumed");
            pending = { ...original, jobId: values[0] as string, operation: m.operation, status: "REQUESTED" };
            inserts++; order.push("insert"); return [];
          }
          throw new Error("Unexpected successor statement");
        },
      } as unknown as PrismaReaderSummaryClient;
      snapshots.set(tx, { ...state.database });
      // Simulate runtime tenant SELECT establishing holder snapshot, followed
      // by a writer commit before holder acquisition. Admission MUST see it.
      if (state.driftBeforeLock && id === 1) state.database = { ...authority, policySha256: "b".repeat(64) };
      try {
        const result = await work(tx);
        if (pending) { jobs.push(pending); order.push("commit"); }
        else order.push("holder end");
        return result;
      } finally { active.delete(id); shares.delete(id); if (exclusive === id) exclusive = undefined; }
    },
  };
  jest.mocked(captureRefreshDatabaseAuthority).mockImplementation(async ({ client }) => {
    const snapshot = snapshots.get(client as PrismaReaderSummaryClient);
    if (!snapshot) throw new Error("root read outside protected transaction");
    return snapshot;
  });
  jest.mocked(readRefreshPrior).mockImplementation(async (tx) => {
    expect(snapshots.has(tx as PrismaReaderSummaryClient)).toBe(true); return state.prior;
  });
  jest.mocked(readRefreshJobs).mockImplementation(async () => [...jobs]);
  jest.mocked(readRefreshReconciliations).mockImplementation(async () => [...reconciled]);
  const clockDate = new Date(refreshNow);
  const clock = new FixedClock(clockDate);
  const consume = (manifest = m, assertLocal = () => undefined) => consumeRefreshSuccessor({
    summary, manifest, job: successorJob(manifest), clock, assertLocal,
  });
  return { m, jobs, original, reconciled, state, order, active, clockDate, consume,
    inserts: () => inserts, transactions: () => transactions };
}

describe("successor atomic admission contract (modeled connection locks)", () => {
  it("transfers locks before insert, preserves original, and never upserts", async () => {
    const f = fixture(), before = JSON.stringify(f.original);
    await f.consume();
    expect(f.jobs).toHaveLength(2); expect(JSON.stringify(f.original)).toBe(before);
    expect(f.order).toEqual(["authority", "share", "ledgers", "reconciliation",
      "authority", "share", "ledgers", "reconciliation", "holder end", "upgrade", "validate", "insert", "commit"]);
    expect(f.active.size).toBe(0);
  });
  it.each(["ledgers", "reconciliation"])("rejects every malformed %s lock result", async (capability) => {
    for (const rows of [[], [{ locked: false }], [{ locked: null }], [{ locked: "true" }],
      [{ locked: true }, { locked: true }]]) {
      const f = fixture(); f.state.lockResult = rows; f.state.malformedCapability = capability;
      await expect(f.consume()).rejects.toThrow(/lock.*not acquired/);
      expect(f.jobs).toHaveLength(1); expect(f.active.size).toBe(0);
      expect(f.order).not.toContain("upgrade");
      expect(f.transactions()).toBe(1);
      if (capability === "ledgers") expect(f.order).not.toContain("reconciliation");
    }
  });
  it.each(["ledgers", "reconciliation"])("unwinds %s capability conflict without retry", async (capability) => {
    const f = fixture(); f.state.capabilityFailure = capability;
    await expect(f.consume()).rejects.toThrow(/55P03/);
    expect(f.transactions()).toBe(1); expect(f.active.size).toBe(0);
    expect(f.inserts()).toBe(0);
  });
  it("rejects a second grant with changed expiry after consumption", async () => {
    const f = fixture(); await f.consume();
    const second = { ...f.m, successor: { ...f.m.successor!, expiresAt: "2026-09-05T22:29:00.000Z" } };
    await expect(f.consume(second)).rejects.toThrow(/consumed/);
    expect(f.inserts()).toBe(1);
  });
  it.each(["REQUESTED", "RUNNING", "FAILED", "COMPLETED", "QUALITY_REJECTED", "UNKNOWN"])(
    "never reuses successor in %s state", async (status) => {
      const f = fixture(); f.jobs.push({ ...f.original, jobId: "successor", operation: f.m.operation, status });
      await expect(f.consume()).rejects.toThrow(/consumed/); expect(f.inserts()).toBe(0);
    });
  it("cannot retire a failed successor by reconciling it", async () => {
    const f = fixture();
    f.jobs.push({ ...f.original, jobId: "successor", operation: f.m.operation });
    f.reconciled.push({ ...f.reconciled[0]!, jobId: "successor", operation: f.m.operation });
    await expect(f.consume()).rejects.toThrow(/history changed/); expect(f.inserts()).toBe(0);
  });
  it.each(["valid", "lostHolder", "busy", "driftBeforeLock", "prior"])("rolls back on %s without retry", async (change) => {
    const f = fixture();
    if (change === "valid") f.state.valid = false;
    else if (change === "prior") f.state.prior = { ...f.m.prior, proofSha256: "b".repeat(64) };
    else f.state[change as "lostHolder" | "busy" | "driftBeforeLock"] = true;
    await expect(f.consume()).rejects.toThrow();
    expect(f.inserts()).toBe(0); expect(f.jobs).toHaveLength(1); expect(f.active.size).toBe(0);
    expect(f.transactions()).toBeLessThanOrEqual(2);
  });
  it("rolls back a staged insert when the final fence or expiry check fails", async () => {
    for (const failure of ["fence", "expiry"]) {
      const f = fixture();
      await expect(f.consume(f.m, () => {
        if (f.inserts() === 0) return;
        if (failure === "fence") throw new Error("fence drift");
        f.clockDate.setTime(Date.parse("2026-09-05T22:26:00Z"));
      })).rejects.toThrow();
      expect(f.jobs).toHaveLength(1); expect(f.inserts()).toBe(1); expect(f.active.size).toBe(0);
    }
  });
  it("concurrent grants cannot both commit; lock conflicts never auto-retry", async () => {
    const f = fixture();
    const results = await Promise.allSettled([f.consume(), f.consume()]);
    const successes = results.filter((result) => result.status === "fulfilled").length;
    expect(successes).toBeLessThanOrEqual(1); expect(f.jobs).toHaveLength(1 + successes);
    expect(f.active.size).toBe(0); expect(f.transactions()).toBe(4);
  });
  it("does not enter consumption with a forged request identity", async () => {
    const f = fixture();
    const invalid = { ...f.m, operation: "forged" } as RefreshManifest;
    await expect(f.consume(invalid)).rejects.toThrow(/identity/);
    expect(f.inserts()).toBe(0);
  });
});
