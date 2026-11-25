import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

export type ReaderSummaryDailyProviderVerification =
  | Readonly<{ kind: "authority_verified" }>
  | Readonly<{ kind: "provider_deferred"; reasonCode: string }>
  | Readonly<{ kind: "authority_blocked"; reasonCode: string }>;

export type ReaderSummaryDailyClaimedExecutionResult = Readonly<{
  kind: "completed" | "replayed";
  requestedUtcDate: string;
}>;

export type ReaderSummaryDailyCatchUpEvidence = Readonly<{
  schemaVersion: 1;
  outcome: "caught_up" | "pending" | "nothing_eligible" | "blocked";
  eligibleThrough: string;
  events: readonly Readonly<{
    requestedUtcDate?: string;
    state: string;
    reasonCode?: string;
  }>[];
}>;

export const readerSummaryDailyCatchUpBatchSize = 7;

export class ReaderSummaryDailyCatchUpSupervisor {
  constructor(private readonly dependencies: Readonly<{
    claimOldest(): Promise<ReaderSummaryDailyClaimResult>;
    verifyProviders(
      work: ReaderSummaryDailyExecutionWork,
    ): Promise<ReaderSummaryDailyProviderVerification>;
    executeClaimed(
      work: ReaderSummaryDailyExecutionWork,
    ): Promise<ReaderSummaryDailyClaimedExecutionResult>;
  }>) {}

  async run(): Promise<ReaderSummaryDailyCatchUpEvidence> {
    const events: Array<{
      requestedUtcDate?: string;
      state: string;
      reasonCode?: string;
    }> = [];
    let lastProcessedEligibleThrough: string | undefined;
    for (let processed = 0;
      processed < readerSummaryDailyCatchUpBatchSize;
      processed += 1) {
      const claim = await this.dependencies.claimOldest();
      if (claim.kind === "caught_up") {
        return evidence("caught_up", claim.eligibleThrough, events);
      }
      if (claim.kind === "recovery_required") {
        events.push({
          requestedUtcDate: claim.nextUnresolvedUtcDate,
          state: claim.kind,
        });
        return evidence("blocked", claim.eligibleThrough, events);
      }
      if (claim.kind === "leased" || claim.kind === "failed_ambiguous") {
        events.push({ requestedUtcDate: claim.requestedUtcDate, state: claim.kind });
        return evidence(
          claim.kind === "leased" ? "nothing_eligible" : "blocked",
          claim.requestedUtcDate,
          events,
        );
      }

      const work = claim.work;
      lastProcessedEligibleThrough = work.eligibleThrough;
      if (work.modelJobState === "RUNNING" ||
          work.modelJobState === "FAILED_AMBIGUOUS") {
        events.push({
          requestedUtcDate: work.requestedUtcDate,
          state: work.modelJobState.toLowerCase(),
        });
        return evidence("blocked", work.eligibleThrough, events);
      }
      if (work.modelJobState === "RESERVED") {
        const provider = await this.dependencies.verifyProviders(work);
        events.push({
          requestedUtcDate: work.requestedUtcDate,
          state: provider.kind,
          ...(provider.kind === "authority_verified"
            ? {}
            : { reasonCode: provider.reasonCode }),
        });
        if (provider.kind === "provider_deferred") {
          return evidence("nothing_eligible", work.eligibleThrough, events);
        }
        if (provider.kind === "authority_blocked") {
          return evidence("blocked", work.eligibleThrough, events);
        }
      }

      const terminal = await this.dependencies.executeClaimed(work);
      if (terminal.requestedUtcDate !== work.requestedUtcDate) {
        throw new Error("Daily terminal returned a different requested date");
      }
      events.push({
        requestedUtcDate: terminal.requestedUtcDate,
        state: terminal.kind,
      });
    }

    if (lastProcessedEligibleThrough === undefined) {
      throw new Error("Daily catch-up batch finished without a claimed date");
    }
    // Do not probe the next row: claiming it would lease an eighth date merely
    // to determine whether more work exists. The DB cursor resumes it next run.
    return evidence("pending", lastProcessedEligibleThrough, events);
  }
}

const evidence = (
  outcome: ReaderSummaryDailyCatchUpEvidence["outcome"],
  eligibleThrough: string,
  events: ReaderSummaryDailyCatchUpEvidence["events"],
): ReaderSummaryDailyCatchUpEvidence => ({
  schemaVersion: 1,
  outcome,
  eligibleThrough,
  events: [...events],
});
