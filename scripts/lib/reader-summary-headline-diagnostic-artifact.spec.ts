import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHeadlineDiagnosticArtifact, HEADLINE_DIAGNOSTIC_BOUNDS } from "./reader-summary-headline-diagnostic-artifact";
import type { PromotionHeadlineDiagnostic } from "@social-monitor/relevance/features/rank-feed-items/promotion-headline-diagnostic";

const row: PromotionHeadlineDiagnostic = { reasonOrigin: "model_incomplete_source", reviewedTitleUtf16: 17,
  reviewedBodyUtf16: 31, availability: "body_present", wholeInputShape: null, titleCountEqual: null, bodyCountEqual: null };
const scope = { tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace" };

describe("bounded private headline artifact", () => {
  it("persists only allowlisted fields, bounded count/bytes, scoped correlation and private permissions", () => {
    const directory = mkdtempSync(join(tmpdir(), "headline-diagnostic-"));
    try {
      const path = join(directory, "diagnostic.json");
      const sink = createHeadlineDiagnosticArtifact({ path, attemptId: "synthetic-attempt" }, scope);
      for (let i = 0; i < 300; i++) sink.observe(`synthetic-candidate-${i}`, { ...row, title: "synthetic private content" } as PromotionHeadlineDiagnostic);
      sink.flush();
      const bytes = readFileSync(path, "utf8");
      const records = JSON.parse(bytes);
      expect(records).toHaveLength(HEADLINE_DIAGNOSTIC_BOUNDS.count);
      expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(HEADLINE_DIAGNOSTIC_BOUNDS.bytes);
      expect(Object.keys(records[0]).sort()).toEqual(["schemaVersion", "scopeHash", "candidateHash", ...Object.keys(row)].sort());
      expect(bytes).not.toContain("synthetic");
      expect(statSync(path).mode & 0o777).toBe(0o600);
      const replacement = createHeadlineDiagnosticArtifact({ path, attemptId: "different-attempt" }, scope);
      replacement.flush();
      expect(readFileSync(path, "utf8")).toBe(bytes);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("stops at the byte budget even before the count cap", () => {
    let bytes = "";
    const sink = createHeadlineDiagnosticArtifact({ path: "unused", attemptId: "attempt" }, scope,
      (_path, value) => { bytes = value; });
    for (let i = 0; i < 300; i++) sink.observe("candidate", { ...row,
      reasonOrigin: "model_unresolved_qualifications", reviewedTitleUtf16: Number.MAX_SAFE_INTEGER,
      reviewedBodyUtf16: Number.MAX_SAFE_INTEGER });
    sink.flush();
    expect(JSON.parse(bytes).length).toBeGreaterThan(0);
    expect(JSON.parse(bytes).length).toBeLessThan(HEADLINE_DIAGNOSTIC_BOUNDS.count);
    expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(HEADLINE_DIAGNOSTIC_BOUNDS.bytes);
  });

  it("flushes once after capture and isolates persistence failures without retry", () => {
    const persist = jest.fn(() => { throw new Error("synthetic disk failure"); });
    const sink = createHeadlineDiagnosticArtifact({ path: "unused", attemptId: "attempt" }, scope, persist);
    sink.observe("candidate", row);
    expect(persist).not.toHaveBeenCalled();
    expect(() => sink.flush()).not.toThrow();
    sink.observe("later", row); sink.flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown enum values and invalid counts; correlation changes with attempt and workspace", () => {
    const captures: string[] = [];
    for (const [attemptId, workspaceId] of [["a", "w"], ["b", "w"], ["a", "v"]]) {
      const sink = createHeadlineDiagnosticArtifact({ path: "unused", attemptId: attemptId! },
        { ...scope, workspaceId: workspaceId! }, (_path, bytes) => { captures.push(bytes); });
      sink.observe("candidate", { ...row, reasonOrigin: "private source text" } as never);
      sink.observe("candidate", { ...row, reviewedTitleUtf16: NaN });
      sink.observe("candidate", row); sink.flush();
    }
    expect(captures.map((bytes) => JSON.parse(bytes).length)).toEqual([1, 1, 1]);
    expect(new Set(captures.map((bytes) => JSON.parse(bytes)[0].candidateHash)).size).toBe(3);
  });
});
