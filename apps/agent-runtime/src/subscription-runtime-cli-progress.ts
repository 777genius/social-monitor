const prefix = "assessment-progress-v1 ";
const phases = new Set([
  "session.read", "lease.acquire", "provider.refresh", "session.writeback", "provider.task",
  "session.task_update.writeback", "setup", "account_materialization", "executor_run", "auth_cleanup",
  "cancellation", "task_settlement", "disposal",
]);
const transitions = new Set(["started", "completed", "skipped", "failed", "observed"]);
export type AssessmentProgress = Readonly<Record<string, string | number | boolean>>;

export const parseAssessmentProgressLine = (line: string): AssessmentProgress | undefined => {
  if (Buffer.byteLength(line) > 1024 || !line.startsWith(prefix)) return undefined;
  try {
    const value: unknown = JSON.parse(line.slice(prefix.length));
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const v = value as Record<string, unknown>;
    if (v.version !== 1 || typeof v.phase !== "string" || !phases.has(v.phase) ||
        typeof v.transition !== "string" || !transitions.has(v.transition) ||
        typeof v.lastObservedPhase !== "string" || !phases.has(v.lastObservedPhase) ||
        v.providerOutcome !== "unknown") return undefined;
    const result: Record<string, string | number | boolean> = { version: 1,
      phase: v.phase, transition: v.transition, lastObservedPhase: v.lastObservedPhase, providerOutcome: "unknown" };
    for (const key of ["elapsedMs", "remainingMs"]) {
      if (typeof v[key] !== "number" || !Number.isSafeInteger(v[key]) || v[key] < 0) return undefined;
      result[key] = v[key];
    }
    for (const key of ["taskSettled", "disposeSettled", "disposeSucceeded"]) {
      if (v[key] !== undefined && typeof v[key] !== "boolean") return undefined;
      if (typeof v[key] === "boolean") result[key] = v[key];
    }
    return result;
  } catch { return undefined; }
};

// Fixed storage and lifetime work budgets, including invalid/oversized stderr.
// Exhaustion permanently closes diagnostics; no raw text reaches logging.
export const createAssessmentProgressParser = (receive: (record: AssessmentProgress) => void) => {
  const line = Buffer.alloc(1024);
  let size = 0, dropping = false, records = 0, frames = 0;
  let remainingBytes = 256 * 1024;
  return (chunk: Buffer): void => {
    if (records >= 64 || frames >= 256 || remainingBytes === 0) return;
    const input = chunk.subarray(0, remainingBytes);
    for (let offset = 0; offset < input.length && records < 64 && frames < 256;) {
      const newline = input.indexOf(10, offset);
      const end = newline < 0 ? input.length : newline;
      remainingBytes -= end - offset + (newline < 0 ? 0 : 1);
      if (size + end - offset > line.length) dropping = true;
      if (!dropping) { input.copy(line, size, offset, end); size += end - offset; }
      if (newline < 0) return;
      frames++;
      if (!dropping) {
        const record = parseAssessmentProgressLine(line.toString("utf8", 0, size));
        if (record) { records++; try { receive(record); } catch { /* Logging cannot fail execution. */ } }
      }
      size = 0; dropping = false; offset = end + 1;
    }
  };
};
