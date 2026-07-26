import { DomainError } from "@social-monitor/shared-kernel";

import type { ScanAttempt } from "../../domain";
import type { ExecuteScanResult } from "./execute-scan.result";

export type ScanAttemptExecutionDecision =
  | { readonly kind: "execute" }
  | {
      readonly kind: "replay";
      readonly result: ExecuteScanResult;
    }
  | {
      readonly kind: "reject";
      readonly error: DomainError;
    };

export const decideScanAttemptExecution = (params: {
  readonly existing: ScanAttempt | null;
  readonly requestedAttemptNumber: number;
}): ScanAttemptExecutionDecision => {
  if (params.existing === null) {
    return { kind: "execute" };
  }

  const snapshot = params.existing.toSnapshot();
  if (snapshot.status === "succeeded") {
    return {
      kind: "replay",
      result: {
        scanJobId: snapshot.scanJobId,
        fetched: snapshot.fetched,
        inserted: snapshot.inserted,
        skippedDuplicates: snapshot.skippedDuplicates,
        projected: snapshot.projected,
        warnings: [],
      },
    };
  }

  if (
    snapshot.attemptNumber > params.requestedAttemptNumber ||
    (snapshot.status === "failed" &&
      snapshot.attemptNumber === params.requestedAttemptNumber)
  ) {
    return {
      kind: "reject",
      error: new DomainError(
        "operation.conflict",
        snapshot.status === "failed"
          ? "Scan attempt already failed"
          : "Stale scan attempt delivery",
        {
          scanJobId: snapshot.scanJobId,
          attemptNumber: params.requestedAttemptNumber,
        },
      ),
    };
  }

  return { kind: "execute" };
};
