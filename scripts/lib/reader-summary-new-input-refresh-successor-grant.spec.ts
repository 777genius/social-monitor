import { assertRefreshManifest, refreshOperation, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { parseRefreshCommand } from "../run-reader-summary-new-input-refresh";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { successorManifest } from "./reader-summary-new-input-refresh-successor.spec-support";

describe("explicit one-time successor manifest", () => {
  it("requires an explicit date, grant file and reviewed digest", () => {
    expect(parseRefreshCommand(["--prepare", "--date", "2026-09-03", "--successor", "grant.json", "--sha256", "a".repeat(64)]))
      .toEqual({ mode: "prepare", dates: ["2026-09-03"], successor: { path: "grant.json", sha256: "a".repeat(64) } });
    for (const args of [["--prepare", "--successor", "grant.json"],
      ["--prepare", "--date", "2026-09-03", "--successor", "grant.json"],
      ["--prepare", "--date", "2026-09-06", "--successor", "grant.json", "--sha256", "a".repeat(64)]]) {
      expect(() => parseRefreshCommand(args)).toThrow();
    }
  });
  it("admits an explicit successor with a distinct deterministic identity", () => {
    const m = successorManifest();
    expect(() => assertRefreshManifest(m, refreshNow)).not.toThrow();
    expect(m.operation).not.toBe(refreshManifest().operation);
    expect(refreshOperation(m)).toBe(m.operation);
  });
  it("cannot mint another identity by a second grant expiry, capture time or source", () => {
    const m = successorManifest();
    const second = { ...m, successor: { ...m.successor!, expiresAt: "2026-09-05T22:29:00.000Z" },
      preparedAt: "2026-09-05T22:09:00.000Z", observedThrough: "2026-09-05T22:08:00.000Z",
      sourceSha256: "b".repeat(64), deployedSourceSha256: "b".repeat(64) };
    expect(() => assertRefreshManifest(second, refreshNow)).not.toThrow();
    expect(refreshOperation(second)).toBe(m.operation);
  });
  it.each([
    { grantId: "another" }, { filename: "another" }, { format: "anything" },
    { originalJobId: "malformed" }, { reconciliationId: "malformed" },
    { originalManifestJson: "{" }, { expiresAt: "2026-09-05T22:10:00.000Z" },
    { expiresAt: "2026-09-05T22:31:00.000Z" }, { expiresAt: "tomorrow" },
  ])("rejects malformed/expired grant %j", (patch) => {
    const m = successorManifest();
    expect(() => assertRefreshManifest({ ...m, successor: { ...m.successor!, ...patch } } as RefreshManifest, refreshNow)).toThrow();
  });
  it.each(["prior", "authority", "date", "operation"])("rejects changed %s even with a recalculated identity", (field) => {
    const m = successorManifest();
    const changed = field === "prior" ? { ...m, prior: { ...m.prior, proofSha256: "b".repeat(64) } }
      : field === "authority" ? { ...m, authority: { ...m.authority, engagementSha256: "b".repeat(64) } }
      : field === "date" ? { ...m, date: "2026-09-02" } : { ...m, operation: refreshManifest().operation };
    expect(() => assertRefreshManifest(field === "operation" ? changed : { ...changed, operation: refreshOperation(changed) }, refreshNow)).toThrow();
  });
  it("rejects a failed successor as the next original, including stripping its grant", () => {
    const m = successorManifest();
    const chained = { ...m, successor: { ...m.successor!, originalManifestJson: JSON.stringify(m) } };
    expect(() => assertRefreshManifest({ ...chained, operation: refreshOperation(chained) }, refreshNow)).toThrow(/chain/);
    const { successor: omitted, ...stripped } = m; void omitted;
    const forged = { ...chained, successor: { ...chained.successor, originalManifestJson: JSON.stringify(stripped) } };
    expect(() => assertRefreshManifest({ ...forged, operation: refreshOperation(forged) }, refreshNow)).toThrow(/identity/);
  });
  it("does not extend an expired grant even for read-only replay", () => {
    expect(() => assertRefreshManifest(successorManifest(), new Date("2026-09-05T22:25:00Z"), false)).toThrow(/expired/);
  });
  it("retains ordinary fresh-input identities", () => {
    const m = refreshManifest();
    expect(refreshOperation({ ...m, preparedAt: refreshNow.toISOString() })).toBe(m.operation);
    expect(refreshOperation({ ...m, authority: { ...m.authority, engagementSha256: "b".repeat(64) } })).not.toBe(m.operation);
  });
});
