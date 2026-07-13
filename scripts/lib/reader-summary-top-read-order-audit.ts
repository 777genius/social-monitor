import { isUnverifiedLegalTopRead } from "@social-monitor/summary/domain/services/reader-summary-headline-policy";
import type { RankingAuditTopRead } from "./reader-summary-ranking-audit";

export type TopReadOrderAuditRow = {
  readonly index: number;
  readonly providerKey: string;
  readonly signalScore: number;
  readonly confidenceLevel: "low" | "medium" | "high";
  readonly citationCount: number;
  readonly confirmedProviderCount: number;
  readonly selectionSignals: readonly string[];
  readonly riskSignals: readonly string[];
};

export const weakTopReadOutrankingStrongSocialRows = (params: {
  readonly rows: readonly TopReadOrderAuditRow[];
  readonly topReads: readonly RankingAuditTopRead[];
}): readonly TopReadOrderAuditRow[] =>
  params.rows.filter((row, index) => {
    if (!isWeakTopReadWithoutClearReason(row)) {
      return false;
    }

    return params.rows.slice(index + 1).some((candidate) =>
      isStrongSocialReadBelowWeakRead({
        candidate,
        candidateRead: params.topReads[candidate.index - 1],
        weakRow: row,
      }),
    );
  });

const isWeakTopReadWithoutClearReason = (
  row: TopReadOrderAuditRow,
): boolean => {
  const weak =
    row.confidenceLevel === "low" ||
    row.signalScore < 0.7 ||
    row.riskSignals.includes("low_signal_score") ||
    row.riskSignals.includes("low_evidence");
  const hasClearReason =
    row.selectionSignals.includes("cross_provider_confirmation") ||
    row.selectionSignals.includes("multi_citation_evidence") ||
    row.confirmedProviderCount > 1 ||
    row.citationCount > 1;

  return weak && !hasClearReason;
};

const isStrongSocialReadBelowWeakRead = (params: {
  readonly candidate: TopReadOrderAuditRow;
  readonly candidateRead: RankingAuditTopRead | undefined;
  readonly weakRow: TopReadOrderAuditRow;
}): boolean =>
  ["reddit", "x-twitter", "rss"].includes(params.candidate.providerKey) &&
  params.candidate.signalScore >=
    Math.max(1, params.weakRow.signalScore + 0.25) &&
  params.candidate.confidenceLevel !== "low" &&
  !params.candidate.riskSignals.includes("low_signal_score") &&
  !(
    params.weakRow.index === 1 &&
    params.candidateRead !== undefined &&
    isUnverifiedLegalTopRead(params.candidateRead)
  );
