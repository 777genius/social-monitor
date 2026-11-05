import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { hasReaderSummaryEvidenceHardBlock } from "./reader-summary-evidence-eligibility-policy";
import { isFirstPartyOfficialQuality } from "./reader-summary-source-authority-policy";
import { hasProviderTopReadSignal } from "./top-read-eligibility-policy";

const supportOnlyProviderFloor = {
  missingMetricsQualify: false,
  unlistedProvidersQualify: false,
} as const;

export const isAdditionalNotableStoryLeadEvidence = (
  evidence: SummaryEvidenceItem,
): boolean => {
  if (
    evidence.contentQuality?.eligibleForTopRead === false ||
    hasReaderSummaryEvidenceHardBlock(evidence.contentQuality?.flags ?? [])
  ) {
    return false;
  }

  return (
    (evidence.providerKey.trim().toLowerCase() === "rss" &&
      isFirstPartyOfficialQuality(evidence.contentQuality)) ||
    hasProviderTopReadSignal(evidence, supportOnlyProviderFloor) ||
    additionalStoryGitHubProviderRank(evidence) !== undefined
  );
};

export const additionalStoryGitHubProviderRank = (
  evidence: SummaryEvidenceItem,
): number | undefined => {
  const provider = evidence.providerKey.trim().toLowerCase();
  if (provider !== "github" && !provider.startsWith("github-")) {
    return undefined;
  }
  const rankMetric = evidence.providerMetricLabels?.find(
    (metric) => metric.label.trim().toLowerCase() === "rank",
  );
  const match = rankMetric?.value.trim().match(/^#\s*([0-9][0-9,]*)$/u);
  if (match === null || match === undefined) return undefined;
  const rank = Number(match[1]!.replace(/,/gu, ""));
  return Number.isInteger(rank) && rank >= 1 && rank <= 10
    ? rank
    : undefined;
};
