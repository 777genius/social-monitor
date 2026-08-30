import type { PrismaReaderSummaryArtifactRecord } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import type {
  readerSummaryContentForArtifact,
  ReaderSummaryArtifactView,
} from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";

import {
  type ReaderSummaryQualitySummaryReport,
  type TopReadProviderContribution,
  type TopReadQualityReport,
  type TopReadQualityRow,
} from "./reader-summary-quality-dashboard-contract";
import {
  countBy,
  isDefined,
  primaryCounts as primaryCountsForSources,
  providerSkew,
} from "./reader-summary-quality-eval-support";
import { weakTopReadOutrankingStrongSocialRows } from "./reader-summary-top-read-order-audit";
import {
  fingerprint,
  roundMetric,
} from "./yesterday-social-replay-support";

const primarySources = ["reddit", "x-twitter"] as const;
const technicalLeakPatterns = [
  /\bsource item\b/i,
  /\bcanonicalurl\b/i,
  /\bsource-binding\b/i,
  /\bsourcebinding\b/i,
  /\binterest:[0-9a-f-]{8,}\b/i,
  /\bprovider:[a-z0-9_-]+\b/i,
  /\bfeed_item\b/i,
  /\bsource_item\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];

export function buildReaderSummaryMetrics(
  view: ReaderSummaryArtifactView | undefined,
  artifactRecord: PrismaReaderSummaryArtifactRecord | null,
): ReaderSummaryQualitySummaryReport {
  if (view === undefined || artifactRecord === null) {
    return {
      artifactStatus: "missing",
      confidenceLevel: "none",
      confidenceScore: 0,
      selectedFeedItemCount: 0,
      storyClusterCount: 0,
      crossSourceClusterRate: 0,
      topReadCount: 0,
      lowConfidenceTopReadCount: 0,
      lowConfidenceTopReadRate: 0,
      technicalLeakCount: 0,
      topReadProviderSkew: 0,
      primarySelectedCounts: primaryZeroCounts(),
      primaryTopReadCounts: primaryZeroCounts(),
    };
  }

  const lowConfidenceTopReadCount = view.content.topReads.filter(
    (item) => item.confidence.level === "low",
  ).length;
  const topReadProviderCounts = Object.fromEntries(
    countBy(view.content.topReads, (item) => item.providerKey).map((item) => [
      item.providerKey,
      item.count,
    ]),
  );
  const selectedProviderCounts = Object.fromEntries(
    view.coverage.providerBreakdown.map((item) => [
      item.providerKey,
      item.selectedFeedItemCount,
    ]),
  );

  return {
    artifactStatus: "present",
    artifactFingerprint: fingerprint(artifactRecord.id),
    confidenceLevel: view.confidence.level,
    confidenceScore: view.confidence.score,
    selectedFeedItemCount: view.coverage.selectedFeedItemCount,
    storyClusterCount: view.coverage.storyClusterCount,
    crossSourceClusterRate:
      view.coverage.storyClusterCount === 0
        ? 0
        : roundMetric(
            view.coverage.crossSourceClusterCount /
              view.coverage.storyClusterCount,
          ),
    topReadCount: view.content.topReads.length,
    lowConfidenceTopReadCount,
    lowConfidenceTopReadRate:
      view.content.topReads.length === 0
        ? 0
        : roundMetric(lowConfidenceTopReadCount / view.content.topReads.length),
    technicalLeakCount: countTechnicalLeaks(collectUserFacingText(view)),
    topReadProviderSkew: providerSkew(Object.values(topReadProviderCounts)),
    primarySelectedCounts: primaryCounts(selectedProviderCounts),
    primaryTopReadCounts: primaryCounts(topReadProviderCounts),
  };
}

export function buildTopReadQuality(
  view: ReaderSummaryArtifactView | undefined,
  persistedTopReads:
    | ReturnType<typeof readerSummaryContentForArtifact>["topReads"]
    | undefined,
): TopReadQualityReport {
  if (view === undefined) {
    return {
      rowCount: 0,
      unexplainedTopReadCount: 0,
      unexplainedTopReadRate: 0,
      lowConfidenceWithoutRiskCount: 0,
      lowConfidenceWithoutRiskRate: 0,
      weakTopReadOutrankingStrongSocialCount: 0,
      weakTopReadOutrankingStrongSocialRate: 0,
      selectionSignalCounts: {},
      riskSignalCounts: {},
      reliabilityRiskCounts: {},
      providerContribution: [],
      rows: [],
      gates: {
        telemetryAvailableForArtifact: false,
        everyTopReadHasSelectionSignal: false,
        noWeakTopReadOutranksStrongSocialRead: false,
      },
    };
  }

  const duplicateTitleFingerprints = duplicateFingerprintSet(
    view.content.topReads.map((read) =>
      fingerprint(normalizeHumanKey(read.title)),
    ),
  );
  const citationProviderKeysByRead = citationProviderKeysByTopRead(view);
  const rows = view.content.topReads.map((read, index) => {
    const citationProviderKeys =
      citationProviderKeysByRead.get(index) ?? new Set<string>();
    const riskSignals = topReadRiskSignals({
      read,
      citationProviderKeys,
      duplicateTitleFingerprints,
    });

    return {
      index: index + 1,
      providerKey: read.providerKey,
      sourceFingerprint: fingerprint(
        `${read.providerKey}:${read.canonicalUrl ?? read.title}`,
      ),
      signalScore: roundMetric(read.signalScore),
      confidenceLevel: read.confidence.level,
      citationCount: read.citationIds.length,
      confirmedProviderCount: read.confirmedProviderKeys.length,
      matchedRuleCount: read.matchedRules.length,
      providerMetricCount: read.providerMetrics.length,
      selectionSignals: topReadSelectionSignals(read),
      riskSignals,
    } satisfies TopReadQualityRow;
  });
  const unexplainedTopReadCount = rows.filter(
    (row) => row.selectionSignals.length === 0,
  ).length;
  const lowConfidenceWithoutRiskCount = rows.filter(
    (row) =>
      row.confidenceLevel === "low" &&
      !row.riskSignals.some((signal) => signal !== "low_confidence"),
  ).length;
  const weakTopReadOutrankingStrongSocialCount =
    weakTopReadOutrankingStrongSocialRows({
      rows,
      topReads: view.content.topReads,
      persistedTopReads,
    }).length;

  return {
    rowCount: rows.length,
    unexplainedTopReadCount,
    unexplainedTopReadRate: ratio(unexplainedTopReadCount, rows.length),
    lowConfidenceWithoutRiskCount,
    lowConfidenceWithoutRiskRate: ratio(
      lowConfidenceWithoutRiskCount,
      rows.length,
    ),
    weakTopReadOutrankingStrongSocialCount,
    weakTopReadOutrankingStrongSocialRate: ratio(
      weakTopReadOutrankingStrongSocialCount,
      rows.length,
    ),
    selectionSignalCounts: countedRecord(
      rows.flatMap((row) => row.selectionSignals),
    ),
    riskSignalCounts: countedRecord(rows.flatMap((row) => row.riskSignals)),
    reliabilityRiskCounts: countedRecord(
      view.content.reliabilityReport.risks.map(
        (risk) => `${risk.kind}:${risk.level}`,
      ),
    ),
    providerContribution: buildTopReadProviderContribution(view),
    rows,
    gates: {
      telemetryAvailableForArtifact:
        rows.length === view.content.topReads.length &&
        view.content.topReads.length > 0,
      everyTopReadHasSelectionSignal: unexplainedTopReadCount === 0,
      noWeakTopReadOutranksStrongSocialRead:
        weakTopReadOutrankingStrongSocialCount === 0,
    },
  };
}

export function curatedTopReadCountPasses(params: {
  readonly selectedFeedItemCount: number;
  readonly topReadCount: number;
  readonly topReadQuality: TopReadQualityReport;
}): boolean {
  const strictTarget = Math.min(8, params.selectedFeedItemCount);
  if (params.topReadCount >= strictTarget) {
    return true;
  }

  return (
    params.topReadCount >= 5 &&
    params.topReadQuality.gates.everyTopReadHasSelectionSignal === true &&
    params.topReadQuality.gates.noWeakTopReadOutranksStrongSocialRead === true
  );
}

export function topReadProviderSkewPasses(
  summary: ReaderSummaryQualitySummaryReport,
): boolean {
  const skewLimit = summary.topReadCount < 10 ? 0.75 : 0.6;

  return summary.topReadProviderSkew <= skewLimit;
}

function buildTopReadProviderContribution(
  view: ReaderSummaryArtifactView,
): readonly TopReadProviderContribution[] {
  const topReadCounts = new Map(
    countBy(view.content.topReads, (read) => read.providerKey).map((item) => [
      item.providerKey,
      item.count,
    ]),
  );
  const selectedTotal = view.coverage.providerBreakdown.reduce(
    (sum, item) => sum + item.selectedFeedItemCount,
    0,
  );
  const topReadTotal = view.content.topReads.length;

  return view.coverage.providerBreakdown.map((item) => {
    const selectedShare = ratio(item.selectedFeedItemCount, selectedTotal);
    const topReadShare = ratio(
      topReadCounts.get(item.providerKey) ?? 0,
      topReadTotal,
    );

    return {
      providerKey: item.providerKey,
      selectedCount: item.selectedFeedItemCount,
      topReadCount: topReadCounts.get(item.providerKey) ?? 0,
      selectedShare,
      topReadShare,
      topReadLift:
        selectedShare === 0 ? 0 : roundMetric(topReadShare / selectedShare),
    };
  });
}

function topReadSelectionSignals(
  read: ReaderSummaryArtifactView["content"]["topReads"][number],
): readonly string[] {
  return [
    read.signalScore >= 0.7
      ? "high_signal_score"
      : read.signalScore >= 0.4
        ? "medium_signal_score"
        : "low_signal_score",
    read.confidence.level === "high"
      ? "high_confidence"
      : read.confidence.level === "medium"
        ? "medium_confidence"
        : "low_confidence",
    read.matchedRules.length > 0 ? "matched_interest_rules" : undefined,
    read.providerMetrics.length > 0 ? "provider_metrics" : undefined,
    read.confirmedProviderKeys.length > 1
      ? "cross_provider_confirmation"
      : undefined,
    read.citationIds.length > 1 ? "multi_citation_evidence" : undefined,
    read.whyNow.trim().length > 0 ? "has_why_now" : undefined,
    read.whyImportant.length > 0 ? "has_why_important" : undefined,
  ].filter(isDefined);
}

function topReadRiskSignals(params: {
  readonly read: ReaderSummaryArtifactView["content"]["topReads"][number];
  readonly citationProviderKeys: ReadonlySet<string>;
  readonly duplicateTitleFingerprints: ReadonlySet<string>;
}): readonly string[] {
  const read = params.read;
  const riskSignals = [
    read.confidence.level === "low" ? "low_confidence" : undefined,
    read.signalScore < 0.4 ? "low_signal_score" : undefined,
    read.citationIds.length <= 1 ? "low_evidence" : undefined,
    read.providerMetrics.length === 0 ? "weak_provider_metrics" : undefined,
    params.citationProviderKeys.size <= 1 &&
    read.confirmedProviderKeys.length <= 1
      ? "single_source"
      : undefined,
    params.duplicateTitleFingerprints.has(
      fingerprint(normalizeHumanKey(read.title)),
    )
      ? "duplicate_title"
      : undefined,
  ].filter(isDefined);

  return [...new Set(riskSignals)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function citationProviderKeysByTopRead(
  view: ReaderSummaryArtifactView,
): ReadonlyMap<number, ReadonlySet<string>> {
  const providerKeyByCitationId = new Map(
    view.citations.map((citation) => [
      citation.citationId,
      citation.providerKey,
    ]),
  );

  return new Map(
    view.content.topReads.map((read, index) => [
      index,
      new Set(
        read.citationIds
          .map((citationId) => providerKeyByCitationId.get(citationId))
          .filter(isDefined),
      ),
    ]),
  );
}

function duplicateFingerprintSet(
  values: readonly string[],
): ReadonlySet<string> {
  return new Set(
    countBy(values, (value) => value)
      .filter((item) => item.count > 1)
      .map((item) => item.providerKey),
  );
}

function countedRecord(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    countBy(values, (value) => value).map((item) => [
      item.providerKey,
      item.count,
    ]),
  );
}

function normalizeHumanKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : roundMetric(value / total);
}

function collectUserFacingText(
  view: ReaderSummaryArtifactView,
): readonly string[] {
  const content = view.content;

  return [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...content.claimBoard.flatMap((claim) => [
      claim.claim,
      ...claim.risks.map((risk) => risk.description),
    ]),
    ...content.topReads.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
    ...content.selectedPosts.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
    ...content.interestSections.flatMap((section) => [
      section.title,
      section.insight,
    ]),
    ...content.openQuestions,
    ...content.risks,
    ...content.nextActions.flatMap((action) => [action.label, action.reason]),
  ].filter((value) => value.trim().length > 0);
}

function countTechnicalLeaks(values: readonly string[]): number {
  return values.filter((value) =>
    technicalLeakPatterns.some((pattern) => pattern.test(value)),
  ).length;
}

function primaryCounts(counts: Record<string, number>): Record<string, number> {
  return primaryCountsForSources(primarySources, counts);
}

function primaryZeroCounts(): Record<string, number> {
  return primaryCounts({});
}
