import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHeadlineDiagnosticArtifact, HEADLINE_DIAGNOSTIC_COMPLETION_MS, HEADLINE_DIAGNOSTIC_BOUNDS } from "./reader-summary-headline-diagnostic-artifact";
import type { PromotionHeadlineDiagnostic } from "@social-monitor/relevance/features/rank-feed-items/promotion-headline-diagnostic";

const row: PromotionHeadlineDiagnostic = { reasonOrigin: "model_incomplete_source", reviewedTitleUtf16: 17,
  reviewedBodyUtf16: 31, availability: "body_present", wholeInputShape: null, titleCountEqual: null, bodyCountEqual: null };
const scope = { tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace" };

describe("bounded private headline artifact", () => {
  it("persists only allowlisted fields, bounded count/bytes, scoped correlation and private permissions", async () => {
    const directory = mkdtempSync(join(tmpdir(), "headline-diagnostic-"));
    try {
      const path = join(directory, "diagnostic.json");
      const sink = createHeadlineDiagnosticArtifact({ path, attemptId: "synthetic-attempt" }, scope);
      for (let i = 0; i < 300; i++) await sink.observe(`synthetic-candidate-${i}`, { ...row, title: "synthetic private content" } as PromotionHeadlineDiagnostic);
      await sink.flush();
      const bytes = readFileSync(path, "utf8");
      const records = JSON.parse(bytes);
      expect(records).toHaveLength(HEADLINE_DIAGNOSTIC_BOUNDS.count);
      expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(HEADLINE_DIAGNOSTIC_BOUNDS.bytes);
      expect(Object.keys(records[0]).sort()).toEqual(["schemaVersion", "scopeHash", "candidateHash", ...Object.keys(row)].sort());
      expect(bytes).not.toContain("synthetic");
      expect(statSync(path).mode & 0o777).toBe(0o600);
      const replacement = createHeadlineDiagnosticArtifact({ path, attemptId: "different-attempt" }, scope);
      await replacement.flush();
      expect(readFileSync(path, "utf8")).toBe(bytes);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("stops at the byte budget even before the count cap", async () => {
    let bytes = "";
    const sink = createHeadlineDiagnosticArtifact({ path: "unused", attemptId: "attempt" }, scope,
      (_path, value) => { bytes = value; });
    for (let i = 0; i < 300; i++) await sink.observe("candidate", { ...row,
      reasonOrigin: "model_unresolved_qualifications", reviewedTitleUtf16: Number.MAX_SAFE_INTEGER,
      reviewedBodyUtf16: Number.MAX_SAFE_INTEGER });
    await sink.flush();
    expect(JSON.parse(bytes).length).toBeGreaterThan(0);
    expect(JSON.parse(bytes).length).toBeLessThan(HEADLINE_DIAGNOSTIC_BOUNDS.count);
    expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(HEADLINE_DIAGNOSTIC_BOUNDS.bytes);
  });

  it("flushes once after capture and isolates persistence failures without retry", async () => {
    const persist = jest.fn(() => { throw new Error("synthetic disk failure"); });
    const sink = createHeadlineDiagnosticArtifact({ path: "unused", attemptId: "attempt" }, scope, persist);
    await sink.observe("candidate", row);
    expect(persist).not.toHaveBeenCalled();
    await expect(sink.flush()).resolves.toBeUndefined();
    await sink.observe("later", row); await sink.flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("bounds pending completion, aborts once, consumes late rejection and never retries", async () => {
    jest.useFakeTimers();
    try {
      let reject!: (reason: Error) => void;
      const persist = jest.fn<Promise<void>, [string, string, AbortSignal]>(() =>
        new Promise<void>((_resolve, fail) => { reject = fail; }));
      const sink = createHeadlineDiagnosticArtifact({ path: "unused", attemptId: "attempt" }, scope, persist);
      await sink.observe("candidate", row);
      const completion = sink.flush();
      await Promise.resolve();
      expect(persist.mock.calls[0]![2].aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(HEADLINE_DIAGNOSTIC_COMPLETION_MS);
      await expect(completion).resolves.toBeUndefined();
      expect(persist.mock.calls[0]![2].aborted).toBe(true);
      reject(new Error("synthetic late rejection"));
      await Promise.resolve();
      await sink.flush();
      expect(persist).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it("rejects unknown enum values and invalid counts; correlation changes with attempt and workspace", async () => {
    const captures: string[] = [];
    for (const [attemptId, workspaceId] of [["a", "w"], ["b", "w"], ["a", "v"]]) {
      const sink = createHeadlineDiagnosticArtifact({ path: "unused", attemptId: attemptId! },
        { ...scope, workspaceId: workspaceId! }, (_path, bytes) => { captures.push(bytes); });
      await sink.observe("candidate", { ...row, reasonOrigin: "private source text" } as never);
      await sink.observe("candidate", { ...row, reviewedTitleUtf16: NaN });
      await sink.observe("candidate", row); await sink.flush();
    }
    expect(captures.map((bytes) => JSON.parse(bytes).length)).toEqual([1, 1, 1]);
    expect(new Set(captures.map((bytes) => JSON.parse(bytes)[0].candidateHash)).size).toBe(3);
  });
});
