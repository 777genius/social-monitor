import type {
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";

export type SummaryEvidenceCoverageWarning =
  | "no_evidence"
  | "limited_evidence"
  | "single_provider"
  | "no_top_read_eligible_evidence"
  | "downranked_evidence_present";

export const summaryEvidenceCoverageWarnings: readonly SummaryEvidenceCoverageWarning[] =
  [
    "no_evidence",
    "limited_evidence",
    "single_provider",
    "no_top_read_eligible_evidence",
    "downranked_evidence_present",
  ];

export type SummaryEvidenceProviderCount = {
  readonly providerKey: string;
  readonly count: number;
};

export type SummaryEvidenceProfile = {
  readonly rankingPolicyVersion: string;
  readonly selectedEvidenceCount: number;
  readonly storyClusterCount: number;
  readonly providerCount: number;
  readonly providerCounts: readonly SummaryEvidenceProviderCount[];
  readonly crossProviderClusterCount: number;
  readonly topReadEligibleCount: number;
  readonly downrankedEvidenceCount: number;
  readonly conversationContextItemCount: number;
  readonly coverageWarnings: readonly SummaryEvidenceCoverageWarning[];
};

export const buildSummaryEvidenceProfile = (
  selection: SummaryEvidenceSelection,
): SummaryEvidenceProfile => {
  const providerCounts = providerEvidenceCounts(selection);
  const topReadEligibleCount = selection.selectedEvidence.filter(
    (item) => item.contentQuality?.eligibleForTopRead !== false,
  ).length;
  const downrankedEvidenceCount = selection.selectedEvidence.filter(
    (item) => item.contentQuality?.decision === "downrank",
  ).length;

  return {
    rankingPolicyVersion: selection.rankingPolicyVersion,
    selectedEvidenceCount: selection.selectedEvidence.length,
    storyClusterCount: selection.clusters.length,
    providerCount: providerCounts.length,
    providerCounts,
    crossProviderClusterCount: selection.clusters.filter(
      (cluster) => new Set(cluster.providerKeys).size > 1,
    ).length,
    topReadEligibleCount,
    downrankedEvidenceCount,
    conversationContextItemCount: selection.selectedEvidence.filter(
      (item) => item.conversationContext !== undefined,
    ).length,
    coverageWarnings: evidenceCoverageWarnings({
      selectedEvidenceCount: selection.selectedEvidence.length,
      providerCount: providerCounts.length,
      topReadEligibleCount,
      downrankedEvidenceCount,
    }),
  };
};

const providerEvidenceCounts = (
  selection: SummaryEvidenceSelection,
): readonly SummaryEvidenceProviderCount[] => {
  const counts = new Map<string, number>();

  for (const item of selection.selectedEvidence) {
    counts.set(item.providerKey, (counts.get(item.providerKey) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([providerKey, count]) => ({ providerKey, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.providerKey.localeCompare(right.providerKey),
    );
};

const evidenceCoverageWarnings = (params: {
  readonly selectedEvidenceCount: number;
  readonly providerCount: number;
  readonly topReadEligibleCount: number;
  readonly downrankedEvidenceCount: number;
}): readonly SummaryEvidenceCoverageWarning[] => {
  const warnings: SummaryEvidenceCoverageWarning[] = [];

  if (params.selectedEvidenceCount === 0) {
    warnings.push("no_evidence");
  } else if (params.selectedEvidenceCount < 3) {
    warnings.push("limited_evidence");
  }

  if (params.providerCount === 1) {
    warnings.push("single_provider");
  }

  if (params.topReadEligibleCount === 0) {
    warnings.push("no_top_read_eligible_evidence");
  }

  if (params.downrankedEvidenceCount > 0) {
    warnings.push("downranked_evidence_present");
  }

  return warnings;
};
