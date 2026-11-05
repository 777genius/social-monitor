import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import { readerSummaryIndependentProviderFamily } from
  "../value-objects/reader-summary-provider-identity";
import type {
  ReaderSummaryPublicationShadowReport,
  ReaderSummaryPublicationShadowSignal,
} from "./reader-summary-publication-decision";

export const publicationShadowReport = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly evidence: SummaryEvidenceSelection;
}): ReaderSummaryPublicationShadowReport => {
  const snapshot = params.artifact.toSnapshot();
  const evidence = params.evidence.selectedEvidence;
  const providerCounts = countBy(evidence.map((item) =>
    readerSummaryIndependentProviderFamily(item)));
  const providerCount = providerCounts.size;
  const maxProviderCount = Math.max(0, ...providerCounts.values());
  const providerSkew =
    evidence.length === 0 ? 0 : roundMetric(maxProviderCount / evidence.length);
  const sourceWindowEndedAt = new Date(
    params.evidence.sourceWindow.endedAt,
  ).getTime();
  const oldestPublishedAt = Math.min(
    ...evidence
      .map((item) => item.publishedAt?.getTime())
      .filter((value): value is number => value !== undefined),
  );
  const staleHours = Number.isFinite(oldestPublishedAt)
    ? roundMetric((sourceWindowEndedAt - oldestPublishedAt) / 3_600_000)
    : 0;
  const signals: ReaderSummaryPublicationShadowSignal[] = [];

  if (snapshot.confidence.level === "low" || snapshot.confidence.score < 0.6) {
    signals.push({
      code: "low_confidence",
      score: roundMetric(1 - snapshot.confidence.score),
      reason: "Reader summary confidence is below the publish tuning target.",
    });
  }

  if (providerCount <= 1 && evidence.length > 0) {
    signals.push({
      code: "single_source",
      score: 0.7,
      reason: "Selected evidence comes from a single provider family.",
    });
  }

  if (providerSkew > 0.7) {
    signals.push({
      code: "provider_skew",
      score: providerSkew,
      reason: "Selected evidence is dominated by one provider family.",
    });
  }

  if (staleHours > 72) {
    signals.push({
      code: "stale_evidence",
      score: Math.min(1, roundMetric(staleHours / 168)),
      reason: "Some selected evidence is older than the current tuning window.",
    });
  }

  return {
    mode: "shadow",
    policyVersion: "reader_summary_publication_shadow_v1",
    riskScore:
      signals.length === 0
        ? 0
        : roundMetric(
            signals.reduce((sum, signal) => sum + signal.score, 0) /
              signals.length,
          ),
    signals,
  };
};

const roundMetric = (value: number): number => Math.round(value * 1000) / 1000;

const countBy = <TValue>(values: readonly TValue[]): Map<TValue, number> => {
  const counts = new Map<TValue, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};
