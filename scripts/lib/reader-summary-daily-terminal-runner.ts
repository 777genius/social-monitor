import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionCursorPort,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

import { buildReaderSummaryDailyModelJobReceipt } from "./reader-summary-daily-model-job-receipt";
import { verifyReaderSummaryDailySourceAuthority } from "./reader-summary-daily-source-authority-snapshot";

export const readerSummaryDailyLeaseRenewalMs = 5 * 60 * 1_000;
export const readerSummaryDailyAbsoluteRuntimeMs = 7 * 60 * 60 * 1_000;

export interface ReaderSummaryDailySubscriptionRuntime {
  readonly runtimeEngine: "subscription-runtime-cli";
  run(input: {
    readonly modelJobIdentity: string;
    readonly requestedUtcDate: string;
    readonly sourceAuthorityBytes: Buffer;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly responseBytes: Buffer;
    readonly executionAttestation: Readonly<Record<string, unknown>>;
  }>;
}

export type ReaderSummaryDailyRenewalScheduler = (
  callback: () => void,
  intervalMs: number,
) => Readonly<{ stop(): void }>;

export type ReaderSummaryDailyTerminalResult =
  | Readonly<{ kind: "completed" | "replayed"; requestedUtcDate: string; responseBytes: Buffer; receiptBytes: Buffer }>
  | Exclude<ReaderSummaryDailyClaimResult, Readonly<{ kind: "claimed" }>>;

export class ReaderSummaryDailyTerminalRunner {
  constructor(private readonly dependencies: {
    readonly cursor: ReaderSummaryDailyExecutionCursorPort;
    readonly runtime: ReaderSummaryDailySubscriptionRuntime;
    readonly now: () => Date;
    readonly schedule?: ReaderSummaryDailyRenewalScheduler;
  }) {
    if (dependencies.runtime.runtimeEngine !== "subscription-runtime-cli") {
      throw new Error("Daily terminal requires subscription-runtime-cli");
    }
  }

  async runOne(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly firstUnresolvedUtcDate: string;
  }): Promise<ReaderSummaryDailyTerminalResult> {
    const claim = await this.dependencies.cursor.claimNext({
      ...input,
      invokedAt: this.dependencies.now().toISOString(),
    });
    if (claim.kind !== "claimed") return claim;
    const work = claim.work;
    verifyReaderSummaryDailySourceAuthority({
      tenantId: work.tenantId,
      workspaceId: work.workspaceId,
      requestedUtcDate: work.requestedUtcDate,
      authority: work.sourceAuthority,
    });
    if (work.modelJobState === "COMPLETED") return completedReplay(work);
    if (work.modelJobState !== "RESERVED") {
      return { kind: "failed_ambiguous", requestedUtcDate: work.requestedUtcDate };
    }
    assertWithinAbsoluteLease(work, this.dependencies.now());
    const startedAt = this.dependencies.now().toISOString();
    await this.dependencies.cursor.markRunning(leaseInput(work, startedAt));

    const abort = new AbortController();
    let renewalFailure: unknown;
    let renewing = false;
    let pendingRenewal: Promise<void> | undefined;
    const scheduler = (this.dependencies.schedule ?? defaultScheduler)(() => {
      if (renewing || renewalFailure !== undefined) return;
      renewing = true;
      const renewedAt = this.dependencies.now().toISOString();
      pendingRenewal = this.dependencies.cursor.renewLease(leaseInput(work, renewedAt))
        .then(() => undefined)
        .catch((error: unknown) => {
          renewalFailure = error;
          abort.abort();
        })
        .finally(() => { renewing = false; });
    }, readerSummaryDailyLeaseRenewalMs);
    let schedulerStopped = false;
    const stopRenewals = (): void => {
      if (schedulerStopped) return;
      schedulerStopped = true;
      scheduler.stop();
    };

    try {
      const execution = await this.dependencies.runtime.run({
        modelJobIdentity: work.modelJob.value,
        requestedUtcDate: work.requestedUtcDate,
        sourceAuthorityBytes: Buffer.from(work.sourceAuthority.canonicalBytes),
        signal: abort.signal,
      });
      stopRenewals();
      await pendingRenewal;
      if (renewalFailure !== undefined) throw renewalFailure;
      assertWithinAbsoluteLease(work, this.dependencies.now());
      const receipt = buildReaderSummaryDailyModelJobReceipt({
        modelJob: work.modelJob,
        responseBytes: execution.responseBytes,
        attestation: execution.executionAttestation,
      });
      await this.dependencies.cursor.complete({
        ...leaseInput(work, this.dependencies.now().toISOString()),
        completedAt: this.dependencies.now().toISOString(),
        responseBytes: receipt.responseBytes,
        responseSha256: receipt.responseSha256,
        attestation: receipt.attestation,
        attestationBytes: receipt.attestationBytes,
        attestationSha256: receipt.attestationSha256,
        receiptBytes: receipt.receiptBytes,
        receiptSha256: receipt.receiptSha256,
      });
      return {
        kind: "completed",
        requestedUtcDate: work.requestedUtcDate,
        responseBytes: receipt.responseBytes,
        receiptBytes: receipt.receiptBytes,
      };
    } finally {
      stopRenewals();
    }
  }
}

const completedReplay = (work: ReaderSummaryDailyExecutionWork): ReaderSummaryDailyTerminalResult => {
  if (work.completedResponseBytes === undefined || work.completedReceiptBytes === undefined) {
    throw new Error("Daily COMPLETED job is missing exact replay bytes");
  }
  return {
    kind: "replayed",
    requestedUtcDate: work.requestedUtcDate,
    responseBytes: Buffer.from(work.completedResponseBytes),
    receiptBytes: Buffer.from(work.completedReceiptBytes),
  };
};
const leaseInput = (work: ReaderSummaryDailyExecutionWork, at: string) => ({
  tenantId: work.tenantId,
  workspaceId: work.workspaceId,
  workerId: work.lease.owner,
  requestedUtcDate: work.requestedUtcDate,
  fencingToken: work.lease.fencingToken,
  startedAt: at,
  renewedAt: at,
});
const assertWithinAbsoluteLease = (work: ReaderSummaryDailyExecutionWork, now: Date): void => {
  const elapsed = now.getTime() - Date.parse(work.lease.leasedAt);
  if (elapsed < 0 || elapsed >= readerSummaryDailyAbsoluteRuntimeMs ||
      now.getTime() >= Date.parse(work.lease.absoluteExpiresAt)) {
    throw new Error("Daily terminal exceeded its seven-hour absolute cap");
  }
};
const defaultScheduler: ReaderSummaryDailyRenewalScheduler = (callback, intervalMs) => {
  const handle = setInterval(callback, intervalMs);
  handle.unref();
  return { stop: () => clearInterval(handle) };
};
