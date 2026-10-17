import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const virtualModules = new Map([
  ["@social-monitor/shared-kernel", `
export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = "DomainError"; this.code = code; this.details = details;
  }
}
export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });
`],
  ["@social-monitor/summary/domain", `
const pad = (value, width) => String(value).padStart(width, "0");
export const canonicalReaderSummaryPreparationTimestamp = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/\\.(\d{3})Z$/u, ".$1" + "000Z");
};
export const compareReaderSummaryPreparationTimestamps = (left, right) =>
  left.localeCompare(right);
export const primaryReaderSummaryEvidence = () => {
  throw new Error("Unexpected evidence selection");
};
`],
  ["@social-monitor/summary/ports", ""],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtualName = specifier === "../../domain"
      ? "@social-monitor/summary/domain"
      : specifier === "../../ports" ? "@social-monitor/summary/ports" : specifier;
    if (virtualModules.has(virtualName)) {
      return { url: `virtual:${virtualName}`, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("virtual:")) {
      return {
        format: "module",
        source: virtualModules.get(url.slice("virtual:".length)),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { DomainError } = await import("@social-monitor/shared-kernel");
const { validateReaderSummaryExecutionCutoff, resolveReaderSummaryExecutionObservedThrough } =
  await import("../../libs/summary/features/execute-reader-summary-job/execute-reader-summary-job-support.ts");
const { resolveReaderSummaryAuthorityBoundary } =
  await import("../../libs/summary/features/execute-reader-summary-job/reader-summary-first-publication-execution.ts");

const at = new Date("2026-10-17T08:15:00.000Z");
const owner = {
  tenantId: "TEST-tenant",
  workspaceId: "TEST-workspace",
  idempotencyKey: `native-reader-summary-v3:${"a".repeat(64)}`,
  cutoffAt: "2026-10-17T08:15:00.000000Z",
  preparationDeadlineAt: "2026-10-17T08:29:59.999000Z",
};
const snapshot = {
  tenantId: owner.tenantId,
  workspaceId: owner.workspaceId,
  idempotencyKey: owner.idempotencyKey,
  selectionStrategy: "jev_primary_v3",
  preparationCutoffAt: owner.cutoffAt,
  preparationDeadlineAt: owner.preparationDeadlineAt,
  period: { cadence: "daily", timezone: "UTC", startedAt: at, endedAt: new Date(at.getTime() + 86_400_000) },
};
const job = { toSnapshot: () => snapshot };
const clock = { now: () => at };
const captureSource = readFileSync(
  join(root, "scripts/capture-durable-reader-summary-from-postgres.ts"),
  "utf8",
);

const findCall = (source, call) => {
  const start = source.indexOf(call);
  assert.ok(start >= 0, `Missing call expression: ${call}`);
  const open = source.indexOf("(", start);
  assert.ok(open >= 0, `Missing argument list: ${call}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated call expression: ${call}`);
};

test("explicit cutoff on jev_primary_v3 retains the exact conflict guard", () => {
  assert.deepEqual(validateReaderSummaryExecutionCutoff({
    cutoffTime: at.getTime(), job, now: at, recoveryActive: false,
  }), new DomainError(
    "operation.conflict",
    "Explicit live cutoff is unsupported on an authoritative refresh, V3 or recovery route",
  ));
});

test("native command has no observedThrough and its boundary resolves observed undefined", async () => {
  const command = {
    tenantId: owner.tenantId,
    workspaceId: owner.workspaceId,
    readerSummaryJobId: "TEST-job",
    maxEvidenceItems: 200,
  };
  assert.equal(Object.hasOwn(command, "observedThrough"), false);
  assert.deepEqual(await resolveReaderSummaryAuthorityBoundary({
    job,
    nativeOwner: owner,
    explicitCutoffTime: command.observedThrough?.getTime(),
    recoveryActive: false,
    clock,
  }), { ok: true, value: { firstPublicationBoundary: undefined, observed: undefined } });
  assert.deepEqual(await resolveReaderSummaryExecutionObservedThrough({
    cutoffTime: undefined, job, clock, recoveryActive: false,
  }), undefined);

  const nativeCall = findCall(captureSource, "executeNativeReaderSummary({");
  assert.match(nativeCall, /\bcommand,\s*clock\b/u);
  assert.doesNotMatch(nativeCall, /observedThrough/u);
  assert.doesNotMatch(nativeCall, /\{\s*\.\.\.command/u);
});

test("legacy execution keeps the unchanged shared command shape", () => {
  assert.equal(
    captureSource.match(/captureExecution\.execute\(dependencies, command\)/gu)?.length,
    1,
  );
  assert.equal(
    findCall(captureSource, "captureExecution.execute"),
    "captureExecution.execute(dependencies, command)",
  );
  assert.match(captureSource, /const command = \{\s*tenantId: tenant,\s*workspaceId: workspace,\s*readerSummaryJobId: request\.value\.readerSummaryJobId,\s*maxEvidenceItems,\s*\};/u);
});
