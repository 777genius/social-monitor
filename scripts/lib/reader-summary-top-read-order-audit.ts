import { hasReaderSummaryUnverifiedLegalSafetyDemotionRule } from "@social-monitor/summary/domain/policies/reader-summary-editorial-curation-policy";
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
  readonly persistedTopReads?: readonly RankingAuditTopRead[];
}): readonly TopReadOrderAuditRow[] =>
  params.rows.filter((row) => {
    if (!isWeakTopReadWithoutClearReason(row)) {
      return false;
    }

    return params.rows.some(
      (candidate) =>
        candidate.index > row.index &&
        isStrongSocialReadBelowWeakRead({
          candidate,
          candidateRank: candidate.index,
          candidateRead: alignedPersistedTopRead({
            candidate,
            persistedRead: params.persistedTopReads?.[candidate.index - 1],
            presentedRead: params.topReads[candidate.index - 1],
          }),
          weakRank: row.index,
          weakRow: row,
        }),
    );
  });

const alignedPersistedTopRead = (params: {
  readonly candidate: TopReadOrderAuditRow;
  readonly persistedRead: RankingAuditTopRead | undefined;
  readonly presentedRead: RankingAuditTopRead | undefined;
}): RankingAuditTopRead | undefined => {
  if (
    params.persistedRead === undefined ||
    params.presentedRead === undefined ||
    params.persistedRead.providerKey !== params.candidate.providerKey ||
    params.presentedRead.providerKey !== params.candidate.providerKey ||
    params.persistedRead.signalScore !== params.presentedRead.signalScore ||
    params.persistedRead.title !== params.presentedRead.title
  ) {
    return undefined;
  }

  return params.persistedRead;
};

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
  readonly candidateRank: number;
  readonly candidateRead: RankingAuditTopRead | undefined;
  readonly weakRank: number;
  readonly weakRow: TopReadOrderAuditRow;
}): boolean =>
  ["reddit", "x-twitter", "rss"].includes(params.candidate.providerKey) &&
  params.candidate.signalScore >=
    Math.max(1, params.weakRow.signalScore + 0.25) &&
  params.candidate.confidenceLevel !== "low" &&
  !params.candidate.riskSignals.includes("low_signal_score") &&
  !(
    params.weakRank === 1 &&
    params.candidateRank > params.weakRank &&
    params.candidateRead !== undefined &&
    hasReaderSummaryUnverifiedLegalSafetyDemotionRule(
      params.candidateRead.matchedRules,
    )
  );
