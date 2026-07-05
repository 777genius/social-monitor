import type {
  ReaderSummaryArtifact,
  ReaderSummaryContent,
} from "../entities/reader-summary-artifact";
import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export type ReaderSummaryPublicationRejectionCode =
  | "no_top_reads"
  | "top_read_missing_citation"
  | "top_read_citation_not_found"
  | "top_read_evidence_not_found"
  | "top_read_ineligible_source"
  | "technical_leakage";

export type ReaderSummaryPublicationShadowSignalCode =
  | "low_confidence"
  | "single_source"
  | "provider_skew"
  | "stale_evidence";

export type ReaderSummaryPublicationShadowSignal = {
  readonly code: ReaderSummaryPublicationShadowSignalCode;
  readonly score: number;
  readonly reason: string;
};

export type ReaderSummaryPublicationShadowReport = {
  readonly mode: "shadow";
  readonly policyVersion: "reader_summary_publication_shadow_v1";
  readonly riskScore: number;
  readonly signals: readonly ReaderSummaryPublicationShadowSignal[];
};

export type ReaderSummaryPublicationRejectionFinding = {
  readonly code: ReaderSummaryPublicationRejectionCode;
  readonly reason: string;
  readonly topReadTitle?: string;
  readonly citationId?: string;
  readonly feedItemId?: string;
  readonly sourceItemId?: string;
  readonly providerKey?: string;
  readonly canonicalUrl?: string;
};

export type ReaderSummaryPublicationDecision =
  | {
      readonly status: "published";
      readonly qualityPassed: true;
      readonly canonicalScore: number;
      readonly shadow: ReaderSummaryPublicationShadowReport;
      readonly reasons: readonly string[];
    }
  | {
      readonly status: "rejected";
      readonly qualityPassed: false;
      readonly canonicalScore: number;
      readonly shadow: ReaderSummaryPublicationShadowReport;
      readonly reasonCodes: readonly ReaderSummaryPublicationRejectionCode[];
      readonly reasons: readonly string[];
      readonly findings: readonly ReaderSummaryPublicationRejectionFinding[];
    };

export class ReaderSummaryPublicationPolicy {
  evaluate(params: {
    readonly artifact: ReaderSummaryArtifact;
    readonly evidence: SummaryEvidenceSelection;
  }): ReaderSummaryPublicationDecision {
    const snapshot = params.artifact.toSnapshot();
    const noSignal = snapshot.qualityFlags.includes("no_signal");
    const citationById = new Map(
      snapshot.citationMap.map((citation) => [
        citation.citationId,
        citation,
      ] as const),
    );
    const evidenceByFeedItemId = new Map(
      params.evidence.selectedEvidence.map((item) => [
        item.feedItemId,
        item,
      ] as const),
    );
    const technicalLeaks =
      snapshot.content === undefined
        ? []
        : collectReaderSummaryUserFacingTechnicalLeaks(snapshot.content);
    const topReads = topReadReferences(snapshot);
    const shadow = publicationShadowReport(params);
    const rejectionFindings: ReaderSummaryPublicationRejectionFinding[] = [];

    if (!noSignal && topReads.length === 0) {
      rejectionFindings.push({
        code: "no_top_reads",
        reason: "Reader summary artifact has no publishable top reads.",
      });
    }

    for (const leak of technicalLeaks) {
      rejectionFindings.push({
        code: "technical_leakage",
        reason: `Reader summary user-facing text contains technical leakage: ${leak}`,
      });
    }

    for (const topRead of topReads) {
      if (topRead.citationIds.length === 0) {
        rejectionFindings.push({
          code: "top_read_missing_citation",
          reason: `Top read "${topRead.title}" has no citation.`,
          topReadTitle: topRead.title,
        });
        continue;
      }

      for (const citationId of topRead.citationIds) {
        const citation = citationById.get(citationId);
        if (citation === undefined) {
          rejectionFindings.push({
            code: "top_read_citation_not_found",
            reason: `Top read "${topRead.title}" references unknown citation "${citationId}".`,
            topReadTitle: topRead.title,
            citationId,
          });
          continue;
        }

        const evidence = evidenceByFeedItemId.get(citation.feedItemId);
        if (evidence === undefined) {
          rejectionFindings.push({
            code: "top_read_evidence_not_found",
            reason: `Top read "${topRead.title}" references evidence outside the selected window.`,
            topReadTitle: topRead.title,
            citationId: citation.citationId,
            feedItemId: citation.feedItemId,
            sourceItemId: citation.sourceItemId,
            providerKey: citation.providerKey,
            canonicalUrl: citation.canonicalUrl,
          });
          continue;
        }

        if (!isTopReadEligibleEvidence(evidence)) {
          rejectionFindings.push({
            code: "top_read_ineligible_source",
            reason: `Top read "${topRead.title}" references ineligible ${evidence.providerKey} evidence.`,
            topReadTitle: topRead.title,
            citationId: citation.citationId,
            feedItemId: citation.feedItemId,
            sourceItemId: citation.sourceItemId,
            providerKey: evidence.providerKey,
            canonicalUrl: evidence.canonicalUrl,
          });
        }
      }
    }

    const canonicalScore = canonicalPublicationScore({
      topReadCount: topReads.length,
      rejectionCount: rejectionFindings.length,
      confidenceScore: snapshot.confidence.score,
      selectedEvidenceCount: params.evidence.selectedEvidence.length,
      providerCount: new Set(
        params.evidence.selectedEvidence.map((item) => item.providerKey),
      ).size,
    });

    if (rejectionFindings.length > 0) {
      return {
        status: "rejected",
        qualityPassed: false,
        canonicalScore,
        shadow,
        reasonCodes: unique(rejectionFindings.map((item) => item.code)),
        reasons: unique(rejectionFindings.map((item) => item.reason)),
        findings: rejectionFindings,
      };
    }

    return {
      status: "published",
      qualityPassed: true,
      canonicalScore,
      shadow,
      reasons: noSignal
        ? ["Reader summary artifact is a valid no-signal result."]
        : ["Reader summary artifact passed pre-publish quality gates."],
    };
  }
}

export const collectReaderSummaryUserFacingTechnicalLeaks = (
  content: ReaderSummaryContent,
): readonly string[] => {
  const values = [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...content.risks,
    ...content.openQuestions,
    ...content.nextActions.flatMap((item) => [item.label, item.reason]),
    ...content.topReads.flatMap(topReadUserFacingText),
    ...(content.selectedPosts ?? []).flatMap(topReadUserFacingText),
  ];

  return unique(
    values.filter((value) =>
      technicalLeakPatterns.some((pattern) => pattern.test(value)),
    ),
  );
};

const topReadReferences = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): readonly {
  readonly title: string;
  readonly citationIds: readonly string[];
}[] => {
  const topReads = snapshot.content?.topReads;
  if (topReads !== undefined && topReads.length > 0) {
    return topReads.map((item) => ({
      title: item.title,
      citationIds: item.citationIds,
    }));
  }

  return snapshot.topStories.map((item) => ({
    title: item.title,
    citationIds: item.citationIds,
  }));
};

const topReadUserFacingText = (item: TopRead): readonly string[] => [
  item.title,
  item.reason,
  item.whyNow,
  ...item.whyImportant,
];

const canonicalPublicationScore = (params: {
  readonly topReadCount: number;
  readonly rejectionCount: number;
  readonly confidenceScore: number;
  readonly selectedEvidenceCount: number;
  readonly providerCount: number;
}): number => {
  const topReadScore = Math.min(1, params.topReadCount / 10) * 0.35;
  const evidenceScore = Math.min(1, params.selectedEvidenceCount / 80) * 0.2;
  const providerScore = Math.min(1, params.providerCount / 3) * 0.15;
  const confidenceScore = params.confidenceScore * 0.3;
  const penalty = Math.min(0.8, params.rejectionCount * 0.2);

  return roundMetric(
    Math.max(
      0,
      topReadScore + evidenceScore + providerScore + confidenceScore - penalty,
    ),
  );
};

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

const publicationShadowReport = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly evidence: SummaryEvidenceSelection;
}): ReaderSummaryPublicationShadowReport => {
  const snapshot = params.artifact.toSnapshot();
  const evidence = params.evidence.selectedEvidence;
  const providerCounts = countBy(evidence.map((item) => item.providerKey));
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

const unique = <TValue>(values: readonly TValue[]): readonly TValue[] => [
  ...new Set(values),
];

const roundMetric = (value: number): number => Math.round(value * 1000) / 1000;

const countBy = <TValue>(values: readonly TValue[]): Map<TValue, number> => {
  const counts = new Map<TValue, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
};
