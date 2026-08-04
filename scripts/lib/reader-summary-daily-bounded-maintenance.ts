import type {
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";
import type {
  ReaderSummaryDailyBoundedMaintenanceClaimPort,
  ReaderSummaryDailyBoundedMaintenanceClaimResult,
} from "@social-monitor/summary/ports/reader-summary-daily-bounded-maintenance-claim.port";

import {
  collectionArtifactPassesBlockingValidation,
  readerSummaryDailyCollectionArtifactPath,
  readExactDayCollectionArtifact,
} from "./reader-summary-clean-real-day-collection-artifact";
import type { ReaderSummaryDailyProviderVerification } from "./reader-summary-daily-catch-up-supervisor";
import {
  isAfterReaderSummaryDailyMaintenanceBounds,
  isAtReaderSummaryDailyMaintenanceUpperBound,
  readerSummaryDailyJul31Aug3MaintenanceBounds,
} from "./reader-summary-daily-maintenance-bounds";
import {
  assertReaderSummaryDailyMaintenanceScope,
  readerSummaryDailyMaintenanceScope,
  type ReaderSummaryDailyMaintenanceScope,
} from "./reader-summary-daily-maintenance-scope";

export type ReaderSummaryDailyMaintenanceCursorPreview = Readonly<{
  nextUnresolvedUtcDate: string;
}>;

export const readerSummaryDailyJul31Aug3CollectionArgs = (params: {
  readonly requestedUtcDate: string;
  readonly collectionArtifactDirectory: string;
}): readonly string[] => {
  if (
    isAfterReaderSummaryDailyMaintenanceBounds(
      params.requestedUtcDate,
      readerSummaryDailyJul31Aug3MaintenanceBounds,
    )
  ) {
    throw new Error("Bounded maintenance collection is above the upper bound");
  }
  readerSummaryDailyCollectionArtifactPath({
    directory: params.collectionArtifactDirectory,
    collectionDate: params.requestedUtcDate,
  });
  return [
    "run",
    "run:reader-summary-clean-real-day-collection",
    "--",
    "--update",
    "--date",
    params.requestedUtcDate,
    "--provider-catch-up",
    "--wait-for-x-readiness",
    "--allow-historical-provider-collection",
    "--allow-unproven-existing-window",
    "--artifact-directory",
    params.collectionArtifactDirectory,
  ];
};

export const bindReaderSummaryDailyJul31Aug3ExactClaim = (
  claimPort: ReaderSummaryDailyBoundedMaintenanceClaimPort,
  params: Readonly<{ workerId: string; now?: () => Date }>,
): ReaderSummaryDailyBoundedMaintenanceDependencies["claimExactDate"] =>
  async ({ requestedUtcDate }) => {
    if (
      isAfterReaderSummaryDailyMaintenanceBounds(
        requestedUtcDate,
        readerSummaryDailyJul31Aug3MaintenanceBounds,
      )
    ) {
      throw new Error("Bounded maintenance claim is above the upper bound");
    }
    if (params.workerId.trim().length === 0) {
      throw new Error("Bounded maintenance worker id is required");
    }
    return claimPort.claimExactBoundedMaintenance({
      ...readerSummaryDailyMaintenanceScope,
      workerId: params.workerId,
      requestedUtcDate,
      invokedAt: (params.now ?? (() => new Date()))().toISOString(),
    });
  };

export type ReaderSummaryDailyBoundedMaintenanceEvidence = Readonly<{
  schemaVersion: 1;
  outcome: "caught_up" | "pending" | "nothing_eligible" | "blocked";
  lowerInclusive: string;
  upperInclusive: string;
  eligibleThrough: string;
  events: readonly Readonly<{
    requestedUtcDate: string;
    state: string;
    reasonCode?: string;
  }>[];
}>;

export type ReaderSummaryDailyBoundedMaintenanceDependencies = Readonly<{
  collectionArtifactDirectory: string;
  readCursor(): Promise<ReaderSummaryDailyMaintenanceCursorPreview>;
  collectExactDate(input: Readonly<{
    requestedUtcDate: string;
    artifactPath: string;
    scope: ReaderSummaryDailyMaintenanceScope;
    allowHistoricalCollection: true;
    allowUnprovenExistingRowsForExactFullCollection: true;
  }>): Promise<void>;
  validateProviderEvidence(input: Readonly<{
    requestedUtcDate: string;
    artifactPath: string;
    scope: ReaderSummaryDailyMaintenanceScope;
  }>): Promise<ReaderSummaryDailyProviderVerification>;
  claimExactDate(input: Readonly<{
    requestedUtcDate: string;
  }>): Promise<ReaderSummaryDailyBoundedMaintenanceClaimResult>;
  validateClaimedAuthority(input: Readonly<{
    work: ReaderSummaryDailyExecutionWork;
    artifactPath: string;
    scope: ReaderSummaryDailyMaintenanceScope;
  }>): Promise<ReaderSummaryDailyProviderVerification>;
  executeClaimed(
    work: ReaderSummaryDailyExecutionWork,
  ): Promise<Readonly<{ kind: "completed" | "replayed"; requestedUtcDate: string }>>;
}>;

export class ReaderSummaryDailyJul31Aug3MaintenanceRunner {
  constructor(
    private readonly dependencies: ReaderSummaryDailyBoundedMaintenanceDependencies,
  ) {}

  async runOne(): Promise<ReaderSummaryDailyBoundedMaintenanceEvidence> {
    const preview = await this.dependencies.readCursor();
    const requestedUtcDate = preview.nextUnresolvedUtcDate;
    if (
      isAfterReaderSummaryDailyMaintenanceBounds(
        requestedUtcDate,
        readerSummaryDailyJul31Aug3MaintenanceBounds,
      )
    ) {
      return evidence("caught_up", [{
        requestedUtcDate,
        state: "bounded_caught_up",
      }]);
    }

    const artifactPath = readerSummaryDailyCollectionArtifactPath({
      directory: this.dependencies.collectionArtifactDirectory,
      collectionDate: requestedUtcDate,
    });
    await this.dependencies.collectExactDate({
      requestedUtcDate,
      artifactPath,
      scope: readerSummaryDailyMaintenanceScope,
      allowHistoricalCollection: true,
      allowUnprovenExistingRowsForExactFullCollection: true,
    });
    const provider = await this.dependencies.validateProviderEvidence({
      requestedUtcDate,
      artifactPath,
      scope: readerSummaryDailyMaintenanceScope,
    });
    if (provider.kind !== "authority_verified") {
      return evidence(
        provider.kind === "provider_deferred" ? "nothing_eligible" : "blocked",
        [{
          requestedUtcDate,
          state: provider.kind,
          reasonCode: provider.reasonCode,
        }],
      );
    }

    const claim = await this.dependencies.claimExactDate({ requestedUtcDate });
    if (claim.kind !== "claimed") {
      return evidenceForClaim(claim);
    }
    const work = claim.work;
    if (work.requestedUtcDate !== requestedUtcDate) {
      throw new Error("Bounded maintenance claim did not return the pre-collected date");
    }
    assertReaderSummaryDailyMaintenanceScope(work);
    const claimedArtifactPath = readerSummaryDailyCollectionArtifactPath({
      directory: this.dependencies.collectionArtifactDirectory,
      collectionDate: work.requestedUtcDate,
    });
    const claimedProvider = await this.dependencies.validateClaimedAuthority({
      work,
      artifactPath: claimedArtifactPath,
      scope: readerSummaryDailyMaintenanceScope,
    });
    if (claimedProvider.kind !== "authority_verified") {
      return evidence("blocked", [{
        requestedUtcDate: work.requestedUtcDate,
        state: claimedProvider.kind,
        reasonCode: claimedProvider.reasonCode,
      }]);
    }
    const terminal = await this.dependencies.executeClaimed(work);
    if (terminal.requestedUtcDate !== work.requestedUtcDate) {
      throw new Error("Bounded maintenance terminal returned a different requested date");
    }
    return evidence(
      isAtReaderSummaryDailyMaintenanceUpperBound(
        work.requestedUtcDate,
        readerSummaryDailyJul31Aug3MaintenanceBounds,
      )
        ? "caught_up"
        : "pending",
      [{
        requestedUtcDate: terminal.requestedUtcDate,
        state: terminal.kind,
      }],
    );
  }
}

export const validateReaderSummaryDailyMaintenanceCollectionArtifact = (params: {
  readonly collectionArtifactDirectory: string;
  readonly requestedUtcDate: string;
}): ReaderSummaryDailyProviderVerification => {
  if (
    isAfterReaderSummaryDailyMaintenanceBounds(
      params.requestedUtcDate,
      readerSummaryDailyJul31Aug3MaintenanceBounds,
    )
  ) {
    throw new Error("Bounded maintenance evidence is above the upper bound");
  }
  const artifactPath = readerSummaryDailyCollectionArtifactPath({
    directory: params.collectionArtifactDirectory,
    collectionDate: params.requestedUtcDate,
  });
  try {
    const report = readExactDayCollectionArtifact({
      path: artifactPath,
      collectionDate: params.requestedUtcDate,
      expectedScope: readerSummaryDailyMaintenanceScope,
    });
    if (report === null) {
      return {
        kind: "provider_deferred",
        reasonCode: "exact_day_evidence_absent",
      };
    }
    return collectionArtifactPassesBlockingValidation(report)
      ? { kind: "authority_verified" }
      : {
          kind: "authority_blocked",
          reasonCode: "exact_day_evidence_invalid",
        };
  } catch {
    return {
      kind: "authority_blocked",
      reasonCode: "exact_day_evidence_invalid",
    };
  }
};

const evidenceForClaim = (
  claim: Exclude<
    ReaderSummaryDailyBoundedMaintenanceClaimResult,
    Readonly<{ kind: "claimed" }>
  >,
): ReaderSummaryDailyBoundedMaintenanceEvidence => {
  if (claim.kind === "bounded_caught_up") {
    return evidence("caught_up", [{
      requestedUtcDate: claim.nextUnresolvedUtcDate,
      state: claim.kind,
    }]);
  }
  if (claim.kind === "stale_cursor") {
    return evidence("nothing_eligible", [{
      requestedUtcDate: claim.nextUnresolvedUtcDate,
      state: claim.kind,
    }]);
  }
  if (claim.kind === "caught_up") {
    return evidence("caught_up", [{
      requestedUtcDate: claim.eligibleThrough,
      state: claim.kind,
    }]);
  }
  if (claim.kind === "recovery_required") {
    return evidence("blocked", [{
      requestedUtcDate: claim.nextUnresolvedUtcDate,
      state: claim.kind,
    }]);
  }
  return evidence(
    claim.kind === "leased" ? "nothing_eligible" : "blocked",
    [{ requestedUtcDate: claim.requestedUtcDate, state: claim.kind }],
  );
};

const evidence = (
  outcome: ReaderSummaryDailyBoundedMaintenanceEvidence["outcome"],
  events: ReaderSummaryDailyBoundedMaintenanceEvidence["events"],
): ReaderSummaryDailyBoundedMaintenanceEvidence => ({
  schemaVersion: 1,
  outcome,
  lowerInclusive: readerSummaryDailyJul31Aug3MaintenanceBounds.lowerInclusive,
  upperInclusive: readerSummaryDailyJul31Aug3MaintenanceBounds.upperInclusive,
  eligibleThrough: readerSummaryDailyJul31Aug3MaintenanceBounds.upperInclusive,
  events,
});
