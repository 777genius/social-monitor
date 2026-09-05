import { assertRefreshManifest, refreshOperation } from "./reader-summary-new-input-refresh-manifest";
import { parseRefreshCommand } from "../run-reader-summary-new-input-refresh";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { reconcileRefresh } from "./reader-summary-new-input-refresh-guard";

describe("bounded new-input refresh authority", () => {
  it("admits a real newer observation for a terminal NO_SIGNAL on the fixed seven dates", () => {
    expect(() => assertRefreshManifest(refreshManifest(), refreshNow)).not.toThrow();
    expect(parseRefreshCommand([])).toMatchObject({ mode: "prepare", dates: expect.any(Array) });
    expect(parseRefreshCommand(["--prepare", "--date", "2026-09-03"])).toEqual({ mode: "prepare", dates: ["2026-09-03"] });
    expect(() => assertRefreshManifest(refreshManifest(), new Date("2026-09-06T00:00:00Z"), false)).not.toThrow();
  });
  it.each([
    { tenantId: "other" }, { workspaceId: "other" }, { date: "2026-08-29" }, { date: "2026-09-06" },
    { timezone: "Europe/Kyiv" }, { startedAt: "2026-09-02T00:00:00.000Z" },
    { model: "gpt-5.5" }, { reasoningEffort: "xhigh" }, { sourceSha256: "b".repeat(64) },
    { observedThrough: "2026-09-06T00:00:00.000Z" }, { observedThrough: "2026-09-03T00:00:00.000Z" },
  ])("rejects wrong scope/date/policy/cutoff %j", (patch) => {
    const m = { ...refreshManifest(), ...patch } as ReturnType<typeof refreshManifest>;
    expect(() => assertRefreshManifest({ ...m, operation: refreshOperation(m) }, refreshNow)).toThrow();
  });
  it("enforces 30 minute review age independently of content date", () => {
    expect(() => assertRefreshManifest(refreshManifest(), new Date("2026-09-05T22:30:00.001Z"))).toThrow(/stale/);
  });
  it("cannot launder an expired observation through a newer preparedAt", () => {
    const m = { ...refreshManifest(), preparedAt: "2026-09-05T22:29:00.000Z" };
    expect(() => assertRefreshManifest(m, new Date("2026-09-05T22:29:00.001Z"))).toThrow(/stale/);
  });
  it("does not derive a new paid identity from recapture time or cutoff", () => {
    const m = refreshManifest();
    expect(refreshOperation({ ...m, preparedAt: "2026-09-05T22:12:00.000Z", observedThrough: "2026-09-05T22:11:00.000Z" })).toBe(m.operation);
    expect(refreshOperation({ ...m, authority: { ...m.authority, engagementSha256: "b".repeat(64) } })).not.toBe(m.operation);
    expect(refreshOperation({ ...m, prior: { ...m.prior, proofSha256: "b".repeat(64) } })).not.toBe(m.operation);
  });
  it.each([["--date", "2026-09-03"], ["--prepare", "--date", "2026-09-06"], ["--output", "/tmp/new"],
    ["--apply", "file"], ["--prepare", "--dates", "2026-08-30..2026-09-10"]])("rejects broad flags %j", (...args) => {
    expect(() => parseRefreshCommand(args)).toThrow();
  });
  it("reconciles published operation before looking at the new active slot as a prior", () => {
    const m = refreshManifest();
    expect(reconcileRefresh(m, [{ operation: m.operation, jobId: "job-new", artifactId: "new", status: "COMPLETED" }],
      { jobId: "job-new", artifactId: "new", publicationId: "new" })).toBe("published");
  });
  it.each(["REQUESTED", "RUNNING", "FAILED", "QUALITY_REJECTED"])("never retries consumed %s even with a new digest", (status) => {
    const m = refreshManifest();
    expect(() => reconcileRefresh(m, [{ operation: m.operation, jobId: "new", artifactId: null, status }], m.prior)).toThrow(/consumed/);
    expect(() => reconcileRefresh({ ...m, operation: "changed" }, [{ operation: m.operation, jobId: "new", artifactId: null, status }], m.prior)).toThrow(/consumed/);
  });
});
