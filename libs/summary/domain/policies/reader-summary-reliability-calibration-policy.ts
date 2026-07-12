import {
  emptyReaderSummaryReliabilityReport,
  readerSummaryReliabilityPolicyVersion,
  type ReaderSummaryReliabilityReport,
  type ReaderSummaryReliabilityRisk,
  type ReaderSummaryReliabilityRiskLevel,
} from "../entities/reader-summary-reliability";
import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { independentEvidenceProviderKeys } from "../value-objects/reader-summary-provider-identity";

export const buildReaderSummaryReliabilityReport = (
  selection: SummaryEvidenceSelection | undefined,
): ReaderSummaryReliabilityReport => {
  if (selection === undefined || selection.selectedEvidence.length === 0) {
    return emptyReaderSummaryReliabilityReport();
  }

  const risks = compactRisks([
    duplicateRisk(selection),
    staleEvidenceRisk(selection),
    singleSourceRisk(selection),
    weakSourceRisk(selection),
    lowEvidenceDiversityRisk(selection),
  ]);
  const riskScore = roundRatio(
    Math.min(1, risks.reduce((total, risk) => total + risk.score, 0) / 2.5),
  );

  return {
    mode: "shadow",
    policyVersion: readerSummaryReliabilityPolicyVersion,
    riskLevel: riskLevel(riskScore),
    riskScore,
    risks,
  };
};

const duplicateRisk = (
  selection: SummaryEvidenceSelection,
): ReaderSummaryReliabilityRisk | undefined => {
  const duplicateCount = selection.clusters.reduce(
    (total, cluster) => total + cluster.duplicateFeedItemIds.length,
    0,
  );
  const totalClusterItems = selection.clusters.reduce(
    (total, cluster) => total + 1 + cluster.duplicateFeedItemIds.length,
    0,
  );
  const duplicateShare = ratio(duplicateCount, totalClusterItems);
  const maxDuplicateCount = Math.max(
    0,
    ...selection.clusters.map((cluster) => cluster.duplicateFeedItemIds.length),
  );

  if (duplicateCount === 0) {
    return undefined;
  }

  const score =
    duplicateShare >= 0.45 || maxDuplicateCount >= 3
      ? 0.8
      : duplicateShare >= 0.25
        ? 0.55
        : 0.3;

  return {
    kind: "duplicate_risk",
    level: riskLevel(score),
    score,
    description:
      "Several selected items collapse into duplicate story clusters; watch for repeated evidence being over-counted.",
  };
};

const staleEvidenceRisk = (
  selection: SummaryEvidenceSelection,
): ReaderSummaryReliabilityRisk | undefined => {
  const newestObservedAt = newestEvidenceDate(selection.selectedEvidence);
  if (newestObservedAt === undefined) {
    return undefined;
  }

  const ageHours =
    (selection.sourceWindow.endedAt.getTime() - newestObservedAt.getTime()) /
    (60 * 60 * 1000);
  if (ageHours < 12) {
    return undefined;
  }

  const score = ageHours >= 48 ? 0.85 : ageHours >= 24 ? 0.6 : 0.35;

  return {
    kind: "stale_evidence",
    level: riskLevel(score),
    score,
    description:
      "Newest selected evidence is old relative to the summary window end; check for newer source updates before acting.",
  };
};

const singleSourceRisk = (
  selection: SummaryEvidenceSelection,
): ReaderSummaryReliabilityRisk | undefined => {
  const providerCount = providerKeys(selection.selectedEvidence).size;
  const evidenceByFeedItemId = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const crossProviderClusterCount = selection.clusters.filter((cluster) => {
    const evidence = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ].flatMap((feedItemId) => evidenceByFeedItemId.get(feedItemId) ?? []);

    return (
      (evidence.length >= 2
        ? independentEvidenceProviderKeys(evidence).length
        : new Set(cluster.providerKeys).size) > 1
    );
  }).length;

  if (providerCount > 1 && crossProviderClusterCount > 0) {
    return undefined;
  }

  const score = providerCount <= 1 ? 0.8 : 0.45;

  return {
    kind: "single_source",
    level: riskLevel(score),
    score,
    description:
      "Important claims are not confirmed across monitored provider families yet.",
  };
};

const weakSourceRisk = (
  selection: SummaryEvidenceSelection,
): ReaderSummaryReliabilityRisk | undefined => {
  const qualityItems = selection.selectedEvidence.filter(
    (item) => item.contentQuality !== undefined,
  );
  const downrankedCount = qualityItems.filter(
    (item) => item.contentQuality?.decision === "downrank",
  ).length;
  const topReadEligibleCount = selection.selectedEvidence.filter(
    (item) => item.contentQuality?.eligibleForTopRead !== false,
  ).length;
  const weakQualityCount = qualityItems.filter(
    (item) => (item.contentQuality?.qualityScore ?? 1) < 0.5,
  ).length;
  const weakShare = ratio(
    Math.max(downrankedCount, weakQualityCount),
    Math.max(qualityItems.length, selection.selectedEvidence.length),
  );

  if (
    downrankedCount === 0 &&
    weakQualityCount === 0 &&
    topReadEligibleCount > 0
  ) {
    return undefined;
  }

  const score =
    topReadEligibleCount === 0 || weakShare >= 0.5
      ? 0.85
      : weakShare > 0
        ? 0.55
        : 0.35;

  return {
    kind: "weak_source",
    level: riskLevel(score),
    score,
    description:
      "Some selected evidence was down-ranked or failed source quality checks.",
  };
};

const lowEvidenceDiversityRisk = (
  selection: SummaryEvidenceSelection,
): ReaderSummaryReliabilityRisk | undefined => {
  const providerCount = providerKeys(selection.selectedEvidence).size;
  const interestCount = new Set(
    selection.selectedEvidence.map((item) => item.interestId),
  ).size;
  const clusterCount = selection.clusters.length;

  if (providerCount >= 3 && interestCount >= 2 && clusterCount >= 3) {
    return undefined;
  }

  const score =
    providerCount <= 1 || clusterCount <= 1
      ? 0.7
      : providerCount <= 2 && interestCount <= 1
        ? 0.5
        : 0.3;

  return {
    kind: "low_evidence_diversity",
    level: riskLevel(score),
    score,
    description:
      "Evidence diversity is narrow across providers, interests or story clusters.",
  };
};

const compactRisks = (
  risks: readonly (ReaderSummaryReliabilityRisk | undefined)[],
): readonly ReaderSummaryReliabilityRisk[] =>
  risks
    .filter((risk): risk is ReaderSummaryReliabilityRisk => risk !== undefined)
    .sort(
      (left, right) =>
        right.score - left.score || left.kind.localeCompare(right.kind),
    );

const newestEvidenceDate = (
  items: readonly SummaryEvidenceItem[],
): Date | undefined =>
  items
    .map((item) => item.observedAt ?? item.publishedAt)
    .sort((left, right) => right.getTime() - left.getTime())
    .at(0);

const providerKeys = (
  items: readonly SummaryEvidenceItem[],
): ReadonlySet<string> => new Set(items.map((item) => item.providerKey));

const ratio = (value: number, total: number): number =>
  total <= 0 ? 0 : value / total;

const roundRatio = (value: number): number => Math.round(value * 1000) / 1000;

const riskLevel = (score: number): ReaderSummaryReliabilityRiskLevel => {
  if (score >= 0.7) {
    return "high";
  }
  if (score >= 0.4) {
    return "medium";
  }

  return "low";
};
