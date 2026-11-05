export const assessmentProgressPrefix = "assessment-progress-v1 ";
const callbacks = new Set([
  "session.read.started", "session.read.completed", "lease.acquire.started", "lease.acquire.completed",
  "provider.refresh.started", "provider.refresh.completed", "provider.refresh.skipped",
  "session.writeback.started", "session.writeback.completed", "provider.task.started", "provider.task.completed",
  "session.task_update.writeback.started", "session.task_update.writeback.completed", "session.task_update.writeback.failed",
]);
const phases = new Set([...callbacks].map((name) => name.slice(0, name.lastIndexOf("."))).concat([
  "setup", "account_materialization", "executor_run", "auth_cleanup", "cancellation", "task_settlement", "disposal",
]));
const transitions = new Set(["started", "completed", "skipped", "failed", "observed"]);

// Never project event metadata, errors, or provider status into this local receipt.
export function createAssessmentProgress({ write, now, remaining }) {
  const started = now();
  let lastObservedPhase = "setup";
  let ordinaryRecords = 0;
  const cleanupSlots = new Set();
  const mark = (phase, transition, receipt = {}) => {
    if (!phases.has(phase) || !transitions.has(transition)) return;
    const previous = lastObservedPhase;
    if (!["cancellation", "task_settlement", "disposal"].includes(phase)) lastObservedPhase = phase;
    // Only the three actual lifecycle observations own reserved, one-shot slots.
    const cleanup = transition === "observed" &&
      ["cancellation", "task_settlement", "disposal"].includes(phase);
    if (cleanup) {
      if (cleanupSlots.has(phase)) return;
      cleanupSlots.add(phase);
    } else {
      if (ordinaryRecords >= 61) return;
      ordinaryRecords++;
    }
    const record = { version: 1, phase, transition,
      elapsedMs: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(now() - started))),
      remainingMs: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(remaining()))),
      providerOutcome: "unknown", lastObservedPhase: previous };
    for (const key of ["taskSettled", "disposeSettled", "disposeSucceeded"]) {
      if (typeof receipt[key] === "boolean") record[key] = receipt[key];
    }
    try { write(`${assessmentProgressPrefix}${JSON.stringify(record)}\n`); } catch { /* Diagnostics are best effort. */ }
  };
  return { mark, emit(event) {
    if (!callbacks.has(event?.name)) return;
    const split = event.name.lastIndexOf(".");
    mark(event.name.slice(0, split), event.name.slice(split + 1));
  }, count() {}, timing() {} };
}
