import { assertRefreshManifest, refreshOperation, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { parseRefreshCommand } from "../run-reader-summary-new-input-refresh";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { successorManifest, chainedSuccessorManifests } from "./reader-summary-new-input-refresh-successor.spec-support";

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

describe("bounded two-stage successor recovery chain", () => {
  it("admits a second successor whose original is itself a resumed successor of a root with no successor", () => {
    const { second } = chainedSuccessorManifests();
    expect(() => assertRefreshManifest(second, refreshNow)).not.toThrow();
  });
  it("admits an expired historical nested grant while requiring the active grant to remain live", () => {
    const { second } = chainedSuccessorManifests();
    const later = new Date("2026-09-05T22:24:00.000Z");
    const first = JSON.parse(second.successor!.originalManifestJson) as RefreshManifest;
    const expiredNested = { ...first, successor: { ...first.successor!, expiresAt: "2026-09-05T22:15:00.000Z" } };
    const activeDraft = { ...second, successor: { ...second.successor!, originalManifestJson: JSON.stringify(expiredNested) } };
    const active = { ...activeDraft, operation: refreshOperation(activeDraft) };
    expect(() => assertRefreshManifest(active, later)).not.toThrow();
    expect(() => assertRefreshManifest(active, new Date("2026-09-05T22:25:00.000Z"))).toThrow(/expired/);
  });
  it("rejects a third successor stage on top of an already-nested chain", () => {
    const { second } = chainedSuccessorManifests();
    const thirdDraft = { ...second, successor: {
      format: "reader-summary-new-input-refresh-successor-v1" as const,
      originalJobId: "00000000-0000-4000-8000-000000000050",
      reconciliationId: "00000000-0000-4000-8000-000000000051",
      originalManifestJson: JSON.stringify(second), expiresAt: "2026-09-05T22:25:00.000Z",
    } };
    const third = { ...thirdDraft, operation: refreshOperation(thirdDraft) };
    expect(() => assertRefreshManifest(third, refreshNow)).toThrow(/depth/);
  });
  it("rejects a nested chain that reuses the same original job/reconciliation identity across both stages", () => {
    const { first } = chainedSuccessorManifests();
    // Both stages point at the exact same root job/reconciliation instead of
    // the first successor authorizing the second: a degenerate, non-advancing chain.
    const secondDraft = { ...first, successor: { ...first.successor!, originalManifestJson: JSON.stringify(first) } };
    const second = { ...secondDraft, operation: refreshOperation(secondDraft) };
    expect(() => assertRefreshManifest(second, refreshNow)).toThrow(/chain/);
  });
  it("rejects a chain whose nested root bytes were altered after being embedded", () => {
    const { root, first, second } = chainedSuccessorManifests();
    const tamperedRootDraft = { ...root, authority: { ...root.authority, engagementSha256: "b".repeat(64) } };
    const tamperedRoot = { ...tamperedRootDraft, operation: refreshOperation(tamperedRootDraft) };
    const tamperedFirst = { ...first, successor: { ...first.successor!, originalManifestJson: JSON.stringify(tamperedRoot) } };
    const tamperedSecondDraft = { ...second, successor: { ...second.successor!, originalManifestJson: JSON.stringify(tamperedFirst) } };
    const tamperedSecond = { ...tamperedSecondDraft, operation: refreshOperation(tamperedSecondDraft) };
    expect(() => assertRefreshManifest(tamperedSecond, refreshNow)).toThrow(/differs from the original authority/);
  });
  it("rejects a chain that reuses the root's job id for the second stage's own grant, even with a distinct reconciliation id", () => {
    const { first, second } = chainedSuccessorManifests();
    const secondDraft = { ...second, successor: { ...second.successor!, originalJobId: first.successor!.originalJobId } };
    const partiallyReused = { ...secondDraft, operation: refreshOperation(secondDraft) };
    expect(() => assertRefreshManifest(partiallyReused, refreshNow)).toThrow(/chain/);
  });
});
