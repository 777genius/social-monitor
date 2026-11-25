import { DomainError, err, ok } from "@social-monitor/shared-kernel";
import type { ReaderSummaryJobQueuePort, SummaryQuotaPort } from "@social-monitor/summary/ports";
import type { RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

/** Operator-owned one-date grant, not the user request quota. The canonical
 * request persists the consumed job before execution; every resume checks that
 * durable row under the same global/date fences, regardless of file location. */
export function createRefreshAdmission(m: RefreshManifest, deps: {
  assertCurrent(): Promise<void>;
}): { queue: ReaderSummaryJobQueuePort; quota: SummaryQuotaPort } {
  let jobId: string | undefined;
  let reserved = false;
  let enqueued = false;
  const scoped = (command: { tenantId: string; workspaceId: string }) =>
    command.tenantId === m.tenantId && command.workspaceId === m.workspaceId;
  return {
    queue: {
      canAccept: async (command) => {
        if (jobId !== undefined || !scoped(command) || command.causationId !== m.operation ||
            command.correlationId !== m.operation) return false;
        await deps.assertCurrent();
        jobId = command.readerSummaryJobId;
        return true;
      },
      enqueue: async (command) => {
        if (!reserved || enqueued || !scoped(command) || command.readerSummaryJobId !== jobId ||
            command.causationId !== m.operation || command.correlationId !== m.operation) {
          throw new Error("Refresh synchronous request admission mismatch");
        }
        enqueued = true; // Caller executes exactly this persisted job in-process.
      },
    },
    quota: {
      reserveSummaryJob: async (command) => {
        if (reserved || jobId === undefined || !scoped(command) || command.scopeKey !== "workspace" ||
            command.interestId !== undefined || command.operation !== "reader_summary.request") {
          return err(new DomainError("operation.conflict", "Refresh one-date grant unavailable"));
        }
        await deps.assertCurrent();
        reserved = true;
        return ok({ remaining: 0, resetAt: m.preparedAt }); // Never replenishes on expiry.
      },
    },
  };
}
