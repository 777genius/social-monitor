import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type {
  PromotionHeadlineDiagnostic, PromotionHeadlineDiagnosticObserver,
} from "@social-monitor/relevance/features/rank-feed-items/promotion-headline-diagnostic";

const origins = new Set([
  "not_assessed", "invalid_binding", "request_truncated", "request_length", "request_availability",
  "input_unsafe", "model_incomplete_source", "model_unresolved_qualifications", "model_insufficient_support",
  "invalid_proposal", "whole_input_shape", "whole_input_count", "headline_unsafe", "invalid_qualification",
  "reference_budget", "claim_qualification", "subject_support", "accepted",
]);
export const HEADLINE_DIAGNOSTIC_BOUNDS = Object.freeze({ count: 200, bytes: 80_000 });
export type HeadlineDiagnosticArtifactOptions = Readonly<{ path: string; attemptId: string }>;
export type HeadlineDiagnosticPersist = (path: string, bytes: string, signal: AbortSignal) => void | Promise<void>;
export const HEADLINE_DIAGNOSTIC_COMPLETION_MS = 1_000;
const digest = (values: readonly string[]) => createHash("sha256").update(JSON.stringify(values)).digest("hex");

/** One private artifact per fresh rank invocation. No raw identifiers or source data.
 * Buffering occurs at the branch; file I/O occurs only after ranking has settled.
 * A pre-existing path is never overwritten. Composition owns path and attempt identity.
 */
export const createHeadlineDiagnosticArtifact = (
  options: HeadlineDiagnosticArtifactOptions,
  scope: { tenantId: string; workspaceId: string },
  persist: HeadlineDiagnosticPersist = (path, bytes, signal) =>
    writeFile(path, bytes, { flag: "wx", mode: 0o600, signal }),
) => {
  const rows: string[] = [];
  let bytes = 2;
  let flushed = false;
  const scopeHash = digest([scope.tenantId, scope.workspaceId, options.attemptId]);
  const observe: PromotionHeadlineDiagnosticObserver = (candidateId, diagnostic) => {
    try {
      if (flushed || rows.length >= HEADLINE_DIAGNOSTIC_BOUNDS.count || !valid(diagnostic)) return;
      // Deliberate projection: unknown keys can never enter the private artifact.
      const row = JSON.stringify({ schemaVersion: "headline_branch.v1", scopeHash,
        candidateHash: digest([scopeHash, candidateId]), reasonOrigin: diagnostic.reasonOrigin,
        reviewedTitleUtf16: diagnostic.reviewedTitleUtf16, reviewedBodyUtf16: diagnostic.reviewedBodyUtf16,
        availability: diagnostic.availability, wholeInputShape: diagnostic.wholeInputShape,
        titleCountEqual: diagnostic.titleCountEqual, bodyCountEqual: diagnostic.bodyCountEqual });
      const size = Buffer.byteLength(row) + (rows.length === 0 ? 0 : 1);
      if (bytes + size > HEADLINE_DIAGNOSTIC_BOUNDS.bytes) return;
      rows.push(row); bytes += size;
    } catch { /* Private diagnostics cannot change selection. */ }
  };
  return Object.freeze({ observe, flush: async (): Promise<void> => {
    if (flushed) return;
    flushed = true;
    const payload = `[${rows.join(",")}]`;
    rows.length = 0;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const expired = new Promise<void>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(); }, HEADLINE_DIAGNOSTIC_COMPLETION_MS);
        timer.unref();
      });
      // Async fs keeps the event loop free. Abort is best effort, not syscall
      // preemption. Injected implementations must also avoid blocking code.
      const pending = Promise.resolve().then(() => persist(options.path, payload, controller.signal));
      await Promise.race([pending, expired]);
    } catch { /* Consume throws and rejections; no retries or source logs. */ }
    finally { if (timer !== undefined) clearTimeout(timer); }
  } });
};

const valid = (d: PromotionHeadlineDiagnostic): boolean => origins.has(d.reasonOrigin) &&
  [d.reviewedTitleUtf16, d.reviewedBodyUtf16].every((n) => Number.isSafeInteger(n) && n >= 0) &&
  ["body_present", "title_only", "truncated", "unknown"].includes(d.availability) &&
  [d.wholeInputShape, d.titleCountEqual, d.bodyCountEqual].every((v) => v === null || typeof v === "boolean");
