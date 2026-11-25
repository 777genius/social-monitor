import { buildReaderSummaryDailyCanonicalRecoveryReceipt } from "./reader-summary-daily-model-job-receipt";
import type { ReaderSummaryDailySubscriptionRuntime } from "./reader-summary-daily-terminal-runner";
import {
  canonicalRecoveryAmbiguityRetryDate,
  canonicalRecoveryAmbiguityRetryModelJobIdentity,
  canonicalRecoveryAmbiguityRetrySourceAuthoritySha256,
  canonicalRecoveryExpiredInvalidRuntimeDate,
  canonicalRecoveryInvalidProductUnavailableReason,
  canonicalRecoveryDates,
  canonicalRecoverySignalCount,
  DailyCanonicalRecoveryRuntimeFailureError,
  type CanonicalRecoveryAuthority,
  type CanonicalRecoveryDate,
  type CanonicalRecoveryFinalizer,
  type CanonicalRecoveryPublication,
  type CanonicalRecoveryTerminal,
  type CanonicalRecoveryUnavailable,
  type CanonicalRecoveryWork,
} from "./reader-summary-daily-canonical-recovery-v4";
import { invalidProductRetryDates } from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";
import {
  isReaderSummaryDailySourceAuthorityV2,
  verifyReaderSummaryDailySourceAuthority,
} from "./reader-summary-daily-source-authority-snapshot";

const renewalIntervalMs = 5 * 60 * 1_000;

/**
 * V4 owns its output_text admission contract. Keeping its transient raw-output
 * metadata here avoids widening the ordinary terminal runner's durable runtime
 * contract, which never receives or persists raw output_text bytes.
 */
type ReaderSummaryDailyCanonicalRecoveryRuntime = Readonly<{
  readonly runtimeEngine: "subscription-runtime-cli";
  run(input: Parameters<ReaderSummaryDailySubscriptionRuntime["run"]>[0]): Promise<
    Readonly<{
      responseBytes: Buffer;
      executionAttestation: Readonly<Record<string, unknown>>;
      rawOutputSha256: string;
      rawOutputByteLength: number;
    }>
  >;
}>;

class TerminalizedCanonicalRecoveryRuntimeFailureError
  extends DailyCanonicalRecoveryRuntimeFailureError
{
  constructor() {
    super(true);
  }
}

type CanonicalRecoveryCaughtUp = Readonly<{
  kind: "caught_up";
  publications: readonly CanonicalRecoveryPublication[];
  unavailable: readonly CanonicalRecoveryUnavailable[];
}>;

/**
 * Executes only v4's fixed eight-day authority. A successful claim writes the
 * irreversible pre-model consumption marker before this class can reach
 * `runtime.run`, so crashes, timeouts, and lease races fail closed.
 */
export class ReaderSummaryDailyCanonicalRecoveryV4Executor {
  constructor(private readonly dependencies: Readonly<{
    authority: CanonicalRecoveryAuthority;
    runtime: ReaderSummaryDailyCanonicalRecoveryRuntime;
    finalizer: CanonicalRecoveryFinalizer;
    now: () => Date;
    schedule?: (
      callback: () => void,
      intervalMs: number,
    ) => Readonly<{ stop(): void }>;
  }>) {
    if (dependencies.runtime.runtimeEngine !== "subscription-runtime-cli") {
      throw new Error("Daily canonical recovery requires subscription-runtime-cli");
    }
  }

  async runOne(input: Readonly<{
    tenantId: string;
    workspaceId: string;
    workerId: string;
  }>): Promise<
    | Readonly<{ kind: "completed" | "replayed"; publication: CanonicalRecoveryPublication }>
    | CanonicalRecoveryCaughtUp
    | Readonly<{ kind: "leased"; requestedUtcDate: CanonicalRecoveryDate }>
    | Readonly<{
        kind: "failed_ambiguous";
        requestedUtcDate: CanonicalRecoveryDate;
        modelJobIdentity: string;
        sourceAuthoritySha256: string;
        attemptOrdinal: 1 | 2;
      }>
  > {
    const claim = await this.dependencies.authority.claim({
      ...input,
      invokedAt: this.dependencies.now().toISOString(),
    });
    if (claim.kind === "caught_up") {
      return caughtUp(await this.dependencies.authority.readTerminals(input));
    }
    if (claim.kind !== "claimed") return claim;

    let activeWork = claim.work;
    const work = activeWork;
    if (work.state === "FINALIZED") {
      throw new Error("Finalized canonical recovery work must not be leased");
    }
    assertFrozenWork(work);
    assertLeaseCurrent(work, this.dependencies.now());
    if (work.state === "COMPLETED" || work.state === "PUBLICATION_PENDING") {
      const publication = await this.finalize(
        work,
        exact(work.responseBytes, "response"),
        exact(work.receiptBytes, "receipt"),
      );
      return { kind: "replayed", publication };
    }

    // The SQL procedure checks that claim persisted pre_model_consumed_at.
    await this.dependencies.authority.markRunning(
      work,
      this.dependencies.now().toISOString(),
    );
    // Renew and replace the work object immediately before the one bounded
    // model call. This carries the current fence into every later transition.
    activeWork = await this.refreshLease(activeWork);

    const abort = new AbortController();
    let renewalFailure: unknown;
    let renewal: Promise<void> | undefined;
    const schedule = this.dependencies.schedule ?? defaultSchedule;
    const timer = schedule(() => {
      if (renewal !== undefined || renewalFailure !== undefined) return;
      renewal = this.refreshLease(activeWork)
        .then((refreshed) => {
          activeWork = refreshed;
        })
        .catch((error: unknown) => {
          renewalFailure = error;
          abort.abort(error);
        })
        .finally(() => {
          renewal = undefined;
      });
    }, renewalIntervalMs);
    let timerStopped = false;
    const stopRenewalTimer = (): void => {
      if (!timerStopped) {
        timer.stop();
        timerStopped = true;
      }
    };
    const terminalizeRuntimeFailure = async (): Promise<never> => {
      stopRenewalTimer();
      await renewal;
      if (renewalFailure !== undefined) {
        throw renewalFailure;
      }
      assertLeaseCurrent(activeWork, this.dependencies.now());
      const unavailable = await this.dependencies.authority.terminalizeUnavailable(
        activeWork,
      );
      assertUnavailableMatchesWork(unavailable, activeWork);
      throw new TerminalizedCanonicalRecoveryRuntimeFailureError();
    };

    try {
      let execution: Awaited<
        ReturnType<ReaderSummaryDailyCanonicalRecoveryRuntime["run"]>
      >;
      try {
        execution = await this.dependencies.runtime.run({
          tenantId: activeWork.tenantId,
          workspaceId: activeWork.workspaceId,
          modelJobIdentity: activeWork.modelJobIdentity,
          requestedUtcDate: activeWork.requestedUtcDate,
          sourceAuthorityBytes: Buffer.from(activeWork.sourceAuthorityBytes),
          signal: abort.signal,
        });
      } catch (error) {
        if (
          error instanceof DailyCanonicalRecoveryRuntimeFailureError &&
          !error.terminalized
        ) {
          return terminalizeRuntimeFailure();
        }
        throw error;
      }
      // Do not let a queued heartbeat replace activeWork while completion is
      // being fenced. Await the one that is already in flight, then use its
      // refreshed fence for completion and the final pre-publication refresh.
      stopRenewalTimer();
      await renewal;
      if (renewalFailure !== undefined) throw renewalFailure;
      assertLeaseCurrent(activeWork, this.dependencies.now());

      if (
        typeof execution.rawOutputSha256 !== "string" ||
        !/^[0-9a-f]{64}$/u.test(execution.rawOutputSha256) ||
        !Number.isSafeInteger(execution.rawOutputByteLength) ||
        execution.rawOutputByteLength < 1 ||
        execution.rawOutputByteLength > 1_000_000
      ) {
        return terminalizeRuntimeFailure();
      }
      const receipt = buildReaderSummaryDailyCanonicalRecoveryReceipt({
        modelJobIdentity: activeWork.modelJobIdentity,
        requestedUtcDate: activeWork.requestedUtcDate,
        sourceAuthoritySha256: activeWork.sourceAuthoritySha256,
        responseBytes: execution.responseBytes,
        rawOutputSha256: execution.rawOutputSha256,
        rawOutputByteLength: execution.rawOutputByteLength,
        attestation: execution.executionAttestation,
      });
      const completedWork = await this.dependencies.authority.complete(activeWork, {
        completedAt: this.dependencies.now().toISOString(),
        responseBytes: receipt.responseBytes,
        responseSha256: receipt.responseSha256,
        attestation: receipt.attestation,
        attestationBytes: receipt.attestationBytes,
        attestationSha256: receipt.attestationSha256,
        receiptBytes: receipt.receiptBytes,
        receiptSha256: receipt.receiptSha256,
      });
      const publication = await this.finalize(
        completedWork,
        receipt.responseBytes,
        receipt.receiptBytes,
      );
      return { kind: "completed", publication };
    } finally {
      stopRenewalTimer();
    }
  }

  async runAll(input: Readonly<{
    tenantId: string;
    workspaceId: string;
    workerId: string;
  }>): Promise<
    | CanonicalRecoveryCaughtUp
    | Readonly<{ kind: "leased"; requestedUtcDate: CanonicalRecoveryDate }>
    | Readonly<{
        kind: "failed_ambiguous";
        requestedUtcDate: CanonicalRecoveryDate;
        modelJobIdentity: string;
        sourceAuthoritySha256: string;
        attemptOrdinal: 1 | 2;
      }>
  > {
    for (
      let resolved = 0;
      resolved < canonicalRecoveryDates.length + 1;
      resolved += 1
    ) {
      let outcome: Awaited<ReturnType<typeof this.runOne>>;
      try {
        outcome = await this.runOne(input);
      } catch (error) {
        if (
          error instanceof TerminalizedCanonicalRecoveryRuntimeFailureError
        ) {
          continue;
        }
        throw error;
      }
      if (outcome.kind === "failed_ambiguous") {
        const unavailable = await this.readUnavailableForClaim(input, outcome);
        assertUnavailableMatchesClaim(unavailable, outcome);
        continue;
      }
      if (outcome.kind === "caught_up" || outcome.kind === "leased") {
        return outcome;
      }
    }
    throw new Error("Daily canonical recovery exceeded exact Jul23-Jul30 coverage");
  }

  private async readUnavailableForClaim(
    input: Readonly<{ tenantId: string; workspaceId: string }>,
    claim: Readonly<{
      requestedUtcDate: CanonicalRecoveryDate;
      modelJobIdentity: string;
      sourceAuthoritySha256: string;
    attemptOrdinal: 1 | 2;
  }>,
  ): Promise<CanonicalRecoveryUnavailable> {
    if (claim.requestedUtcDate === canonicalRecoveryExpiredInvalidRuntimeDate) {
      const authority = this.dependencies.authority;
      if (
        claim.attemptOrdinal !== 1 ||
        authority.reconcileExpiredUnavailable === undefined
      ) {
        throw new Error("Daily canonical recovery failed ambiguity is not an unavailable terminal");
      }
      return authority.reconcileExpiredUnavailable({
        ...input,
        requestedUtcDate: claim.requestedUtcDate,
        modelJobIdentity: claim.modelJobIdentity,
        sourceAuthoritySha256: claim.sourceAuthoritySha256,
        attemptOrdinal: claim.attemptOrdinal,
      });
    }
    return this.dependencies.authority.readUnavailable({
      ...input,
      requestedUtcDate: claim.requestedUtcDate,
    });
  }

  private async finalize(
    work: CanonicalRecoveryWork,
    responseBytes: Buffer,
    receiptBytes: Buffer,
  ): Promise<CanonicalRecoveryPublication> {
    const freshWork = await this.refreshLease(work);
    const publication = await this.dependencies.finalizer.finalize({
      work: freshWork,
      responseBytes,
      receiptBytes,
    });
    const committed = await this.dependencies.authority.readFinalized({
      tenantId: freshWork.tenantId,
      workspaceId: freshWork.workspaceId,
    });
    const readback = committed.find(
      (entry) => entry.requestedUtcDate === freshWork.requestedUtcDate,
    );
    if (readback === undefined || !samePublication(readback, publication)) {
      throw new Error(
        "Daily canonical recovery public readback diverged after commit",
      );
    }
    return readback;
  }

  private async refreshLease(
    work: CanonicalRecoveryWork,
  ): Promise<CanonicalRecoveryWork> {
    const renewedAt = this.dependencies.now();
    assertLeaseCurrent(work, renewedAt);
    const refreshed = await this.dependencies.authority.renew(
      work,
      renewedAt.toISOString(),
    );
    assertRenewedWork(work, refreshed);
    assertLeaseCurrent(refreshed, this.dependencies.now());
    return refreshed;
  }
}

const exact = (value: Buffer | undefined, label: string): Buffer => {
  if (value === undefined || value.length === 0) {
    throw new Error(`Completed canonical recovery work lacks exact ${label} bytes`);
  }
  return Buffer.from(value);
};

const caughtUp = (
  terminals: readonly CanonicalRecoveryTerminal[],
): CanonicalRecoveryCaughtUp => {
  if (terminals.length !== canonicalRecoveryDates.length) {
    throw new Error("Daily canonical recovery terminal read is incomplete");
  }
  const publications: CanonicalRecoveryPublication[] = [];
  const unavailable: CanonicalRecoveryUnavailable[] = [];
  for (const [index, terminal] of terminals.entries()) {
    const requestedUtcDate = terminal.kind === "finalized"
      ? terminal.publication.requestedUtcDate
      : terminal.unavailable.requestedUtcDate;
    if (requestedUtcDate !== canonicalRecoveryDates[index]) {
      throw new Error("Daily canonical recovery terminal read is not exact Jul23-Jul30 coverage");
    }
    if (terminal.kind === "finalized") {
      publications.push(terminal.publication);
    } else {
      assertUnavailableTerminal(terminal.unavailable);
      unavailable.push(terminal.unavailable);
    }
  }
  return Object.freeze({
    kind: "caught_up" as const,
    publications: Object.freeze(publications),
    unavailable: Object.freeze(unavailable),
  });
};

const assertUnavailableMatchesWork = (
  unavailable: CanonicalRecoveryUnavailable,
  work: CanonicalRecoveryWork,
): void => {
  assertUnavailableTerminal(unavailable);
  if (
    unavailable.requestedUtcDate !== work.requestedUtcDate ||
    unavailable.signalCount !== canonicalRecoverySignalCount(work.sourceAuthorityBytes) ||
    unavailable.sourceAuthoritySha256 !== work.sourceAuthoritySha256 ||
    unavailable.modelJobIdentity !== work.modelJobIdentity ||
    unavailable.attemptOrdinal !== work.attemptOrdinal
  ) {
    throw new Error("Daily canonical recovery unavailable terminal lost its fenced work binding");
  }
};

const assertUnavailableMatchesClaim = (
  unavailable: CanonicalRecoveryUnavailable,
  claim: Readonly<{
    requestedUtcDate: string;
    modelJobIdentity: string;
    sourceAuthoritySha256: string;
    attemptOrdinal: 1 | 2;
  }>,
): void => {
  assertUnavailableTerminal(unavailable);
  if (
    unavailable.requestedUtcDate !== claim.requestedUtcDate ||
    unavailable.modelJobIdentity !== claim.modelJobIdentity ||
    unavailable.sourceAuthoritySha256 !== claim.sourceAuthoritySha256 ||
    unavailable.attemptOrdinal !== claim.attemptOrdinal
  ) {
    throw new Error("Daily canonical recovery failed ambiguity is not an unavailable terminal");
  }
};

const assertUnavailableTerminal = (
  unavailable: CanonicalRecoveryUnavailable,
): void => {
  if (
    !(canonicalRecoveryDates as readonly string[]).includes(unavailable.requestedUtcDate) ||
    (unavailable.reasonCode !== "model_result_not_durably_persisted_after_consumed_attempt" &&
      unavailable.reasonCode !== canonicalRecoveryInvalidProductUnavailableReason) ||
    !Number.isSafeInteger(unavailable.signalCount) ||
    unavailable.signalCount < 0 ||
    !/^[0-9a-f]{64}$/u.test(unavailable.sourceAuthoritySha256) ||
    !/^[0-9a-f]{64}$/u.test(unavailable.modelJobIdentity) ||
    (unavailable.attemptOrdinal !== 1 && unavailable.attemptOrdinal !== 2) ||
    (unavailable.attemptOrdinal === 2 && (
      (unavailable.requestedUtcDate === canonicalRecoveryAmbiguityRetryDate && (
        unavailable.reasonCode !== "model_result_not_durably_persisted_after_consumed_attempt" ||
        unavailable.signalCount !== 342 ||
        unavailable.modelJobIdentity !== canonicalRecoveryAmbiguityRetryModelJobIdentity ||
        unavailable.sourceAuthoritySha256 !==
          canonicalRecoveryAmbiguityRetrySourceAuthoritySha256
      )) ||
      (unavailable.requestedUtcDate !== canonicalRecoveryAmbiguityRetryDate && (
        !(invalidProductRetryDates as readonly string[]).includes(
          unavailable.requestedUtcDate,
        ) ||
        unavailable.reasonCode !== canonicalRecoveryInvalidProductUnavailableReason
      ))
    )) ||
    (unavailable.attemptOrdinal === 1 &&
      unavailable.reasonCode !== "model_result_not_durably_persisted_after_consumed_attempt")
  ) {
    throw new Error("Daily canonical recovery unavailable terminal is invalid");
  }
};

const assertLeaseCurrent = (work: CanonicalRecoveryWork, now: Date): void => {
  const at = now.getTime();
  const leasedAt = Date.parse(work.leasedAt);
  const leaseExpiresAt = Date.parse(work.leaseExpiresAt);
  const absoluteExpiresAt = Date.parse(work.absoluteExpiresAt);
  if (
    !Number.isFinite(at) ||
    !Number.isFinite(leasedAt) ||
    !Number.isFinite(leaseExpiresAt) ||
    !Number.isFinite(absoluteExpiresAt) ||
    at < leasedAt ||
    at >= leaseExpiresAt ||
    at >= absoluteExpiresAt
  ) {
    throw new Error("Daily canonical recovery lease is stale");
  }
};

const assertFrozenWork = (work: CanonicalRecoveryWork): void => {
  const authority = verifyReaderSummaryDailySourceAuthority({
    tenantId: work.tenantId,
    workspaceId: work.workspaceId,
    requestedUtcDate: work.requestedUtcDate,
    authority: {
      requestedUtcDate: work.requestedUtcDate,
      ingestionCutoff: authorityCutoff(work.sourceAuthorityBytes),
      canonicalBytes: work.sourceAuthorityBytes,
      canonicalSha256: work.sourceAuthoritySha256,
    },
  });
  if (!isReaderSummaryDailySourceAuthorityV2(authority)) {
    throw new Error("Daily canonical recovery requires immutable authority v2");
  }
};

const authorityCutoff = (bytes: Buffer): string => {
  try {
    const authority = JSON.parse(bytes.toString("utf8")) as unknown;
    if (
      authority === null ||
      typeof authority !== "object" ||
      Array.isArray(authority) ||
      typeof (authority as Record<string, unknown>).ingestionCutoff !== "string"
    ) {
      throw new Error("Daily canonical recovery source authority shape is invalid");
    }
    return (authority as Record<string, unknown>).ingestionCutoff as string;
  } catch {
    throw new Error("Daily canonical recovery source authority is not JSON");
  }
};

const assertRenewedWork = (
  current: CanonicalRecoveryWork,
  refreshed: CanonicalRecoveryWork,
): void => {
  const currentExpiry = Date.parse(current.leaseExpiresAt);
  const refreshedExpiry = Date.parse(refreshed.leaseExpiresAt);
  if (
    refreshed.tenantId !== current.tenantId ||
    refreshed.workspaceId !== current.workspaceId ||
    refreshed.requestedUtcDate !== current.requestedUtcDate ||
    refreshed.sourceAuthoritySha256 !== current.sourceAuthoritySha256 ||
    !refreshed.sourceAuthorityBytes.equals(current.sourceAuthorityBytes) ||
    refreshed.modelJobIdentity !== current.modelJobIdentity ||
    refreshed.attemptOrdinal !== current.attemptOrdinal ||
    refreshed.workerId !== current.workerId ||
    refreshed.fencingToken !== current.fencingToken ||
    refreshed.state !== current.state ||
    refreshed.leasedAt !== current.leasedAt ||
    refreshed.absoluteExpiresAt !== current.absoluteExpiresAt ||
    !Number.isFinite(currentExpiry) ||
    !Number.isFinite(refreshedExpiry) ||
    refreshedExpiry < currentExpiry
  ) {
    throw new Error("Daily canonical recovery renewal did not return current fenced work");
  }
};

const samePublication = (
  left: CanonicalRecoveryPublication,
  right: CanonicalRecoveryPublication,
): boolean =>
  left.requestedUtcDate === right.requestedUtcDate &&
  left.sourceAuthoritySha256 === right.sourceAuthoritySha256 &&
  left.modelJobIdentity === right.modelJobIdentity &&
  left.readerSummaryJobId === right.readerSummaryJobId &&
  left.readerSummaryArtifactId === right.readerSummaryArtifactId &&
  left.publicationId === right.publicationId &&
  left.reportSha256 === right.reportSha256 &&
  left.proofSha256 === right.proofSha256 &&
  left.weeklyEvidenceSha256 === right.weeklyEvidenceSha256 &&
  left.publicEvidenceSha256 === right.publicEvidenceSha256 &&
  left.publicFrontendSha256 === right.publicFrontendSha256;

const defaultSchedule = (callback: () => void, intervalMs: number) => {
  const timer = setInterval(callback, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
};
