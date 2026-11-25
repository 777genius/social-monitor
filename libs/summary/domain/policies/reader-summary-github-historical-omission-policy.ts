import { countSensitiveTextFragments } from "@social-monitor/shared-kernel";

import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import {
  exactUtcDay,
  readerSummaryHasNoGitHubEvidence,
  type ReaderSummaryGitHubProjectionEvaluation,
} from "./reader-summary-github-projection-audit";

export const historicalOmissionReaderSummaryGitHubProjectionAudit = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly reason: string;
  readonly authorizedAt: Date;
  readonly observedThrough: Date;
}): ReaderSummaryGitHubProjectionEvaluation => {
  const snapshot = params.artifact.toSnapshot();
  const reason = params.reason.trim();
  const day = exactUtcDay(
    snapshot.period.startedAt,
    snapshot.period.endedAt,
    snapshot.period.timezone,
  );
  const valid =
    day !== undefined &&
    snapshot.period.cadence === "daily" &&
    readerSummaryHasNoGitHubEvidence(params.artifact) &&
    reason.length >= 20 &&
    reason.length <= 500 &&
    !/[\r\n]/u.test(reason) &&
    countSensitiveTextFragments(reason) === 0 &&
    Number.isFinite(params.authorizedAt.getTime()) &&
    Number.isFinite(params.observedThrough.getTime()) &&
    snapshot.period.endedAt.getTime() <=
      Date.UTC(
        params.observedThrough.getUTCFullYear(),
        params.observedThrough.getUTCMonth(),
        params.observedThrough.getUTCDate(),
      ) &&
    snapshot.period.endedAt.getTime() <= params.authorizedAt.getTime() &&
    params.authorizedAt.getTime() <= params.observedThrough.getTime();
  if (!valid) {
    const reason =
      "Historical GitHub omission requires an exact completed UTC day, an explicit reason, and no GitHub evidence anywhere in the artifact.";
    return {
      audit: {
        schemaVersion: "reader_summary.github_projection.v1",
        status: "rejected",
        requestedUtcDay: day?.day ?? snapshot.period.periodKey,
        pageCount: 0,
        scannedItemCount: 0,
        eligibleBindingIds: [],
        bindings: [],
        violationCodes: ["github_projection_mixed"],
        reasons: [reason],
      },
      findings: [{ code: "github_projection_mixed", reason }],
    };
  }

  return {
    audit: {
      schemaVersion: "reader_summary.github_projection.v1",
      status: "not_required",
      requestedUtcDay: day.day,
      pageCount: 0,
      scannedItemCount: 0,
      eligibleBindingIds: [],
      historicalOmission: {
        mode: "github_projection_unavailable_historical",
        reason,
        authorizedAt: params.authorizedAt.toISOString(),
      },
      bindings: [],
      violationCodes: [],
      reasons: [],
    },
    findings: [],
  };
};
